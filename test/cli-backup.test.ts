import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies to isolate getCategoryIncludes and resolvePassphrase logic
vi.mock("ora", () => ({ default: () => ({ start: () => ({ stop: vi.fn(), fail: vi.fn(), succeed: vi.fn() }) }) }));
vi.mock("chalk", () => ({ default: { dim: (s: string) => s, yellow: (s: string) => s } }));
vi.mock("../src/utils/logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    header: vi.fn(),
    kv: vi.fn(),
    raw: vi.fn(),
  },
}));

const mockRequireConfig = vi.fn();
const mockScanOpenClawDir = vi.fn();
const mockIsOpenClawRunning = vi.fn();
const mockEnsureRestic = vi.fn();
const mockBackup = vi.fn();
const mockForget = vi.fn();
const mockGetKeychainPassphrase = vi.fn();

vi.mock("../src/core/config.js", () => ({
  requireConfig: (...args: unknown[]) => mockRequireConfig(...args),
}));

vi.mock("../src/core/openclaw.js", () => ({
  scanOpenClawDir: (...args: unknown[]) => mockScanOpenClawDir(...args),
  DEFAULT_EXCLUDES: ["*.lock", "*-wal"],
  isOpenClawRunning: (...args: unknown[]) => mockIsOpenClawRunning(...args),
}));

vi.mock("../src/core/restic-installer.js", () => ({
  ensureRestic: (...args: unknown[]) => mockEnsureRestic(...args),
}));

vi.mock("../src/core/restic.js", () => ({
  backup: (...args: unknown[]) => mockBackup(...args),
  forget: (...args: unknown[]) => mockForget(...args),
}));

vi.mock("../src/core/keychain.js", () => ({
  getPassphrase: (...args: unknown[]) => mockGetKeychainPassphrase(...args),
}));

// Mock process.exit to prevent test termination
const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
  throw new Error("process.exit called");
}) as never);

const mockConfig = {
  version: 1,
  openclawDir: "/home/user/.openclaw",
  storage: {
    provider: "r2" as const,
    bucket: "test",
    accountId: "abc",
    accessKeyId: "key",
    secretAccessKey: "secret",
  },
  retention: { keepLast: 7, keepDaily: 30, keepWeekly: 12, keepMonthly: 6 },
  daemon: { enabled: false, intervalMinutes: 60, quietMinutes: 5 },
  exclude: [],
  resticVersion: "0.17.3",
};

const mockSummary = {
  message_type: "summary" as const,
  files_new: 5,
  files_changed: 2,
  files_unmodified: 100,
  dirs_new: 0,
  dirs_changed: 0,
  dirs_unmodified: 10,
  data_blobs: 3,
  tree_blobs: 1,
  data_added: 2048,
  total_files_processed: 107,
  total_bytes_processed: 50000,
  total_duration: 1.5,
  snapshot_id: "abc12345def67890",
};

describe("backupCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireConfig.mockResolvedValue(mockConfig);
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [{ path: "/a", relativePath: "a", size: 100, category: "config" }],
      totalSize: 100,
    });
    mockIsOpenClawRunning.mockResolvedValue(false);
    mockEnsureRestic.mockResolvedValue("/mock/bin/restic");
    mockBackup.mockResolvedValue(mockSummary);
    mockForget.mockResolvedValue(undefined);
    // Reset env
    delete process.env.CLAWSTASH_PASSPHRASE;
  });

  it("runs backup with passphrase from flag", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "my-pass" });

    expect(mockBackup).toHaveBeenCalled();
    const backupArgs = mockBackup.mock.calls[0];
    expect(backupArgs[0]).toBe("/home/user/.openclaw");
    expect(backupArgs[1].passphrase).toBe("my-pass");
  });

  it("runs backup with passphrase from env var", async () => {
    process.env.CLAWSTASH_PASSPHRASE = "env-pass";

    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({});

    const backupArgs = mockBackup.mock.calls[0];
    expect(backupArgs[1].passphrase).toBe("env-pass");

    delete process.env.CLAWSTASH_PASSPHRASE;
  });

  it("runs backup with passphrase from keychain", async () => {
    mockGetKeychainPassphrase.mockResolvedValue("keychain-pass");

    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({});

    const backupArgs = mockBackup.mock.calls[0];
    expect(backupArgs[1].passphrase).toBe("keychain-pass");
  });

  it("exits when no passphrase available", async () => {
    mockGetKeychainPassphrase.mockResolvedValue(null);

    const { backupCommand } = await import("../src/cli/backup.js");
    await expect(backupCommand({})).rejects.toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("prefers flag over env over keychain", async () => {
    process.env.CLAWSTASH_PASSPHRASE = "env-pass";
    mockGetKeychainPassphrase.mockResolvedValue("keychain-pass");

    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "flag-pass" });

    const backupArgs = mockBackup.mock.calls[0];
    expect(backupArgs[1].passphrase).toBe("flag-pass");

    delete process.env.CLAWSTASH_PASSPHRASE;
  });

  it("passes excludes from config and defaults", async () => {
    mockRequireConfig.mockResolvedValue({
      ...mockConfig,
      exclude: ["*.custom"],
    });

    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass" });

    const backupOpts = mockBackup.mock.calls[0][2];
    expect(backupOpts.excludes).toContain("*.lock");
    expect(backupOpts.excludes).toContain("*.custom");
  });

  it("uses --only to set include patterns", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass", only: "secrets" });

    const backupOpts = mockBackup.mock.calls[0][2];
    expect(backupOpts.includes).toContain("credentials/**");
    expect(backupOpts.includes).toContain("auth/**");
    expect(backupOpts.includes).toContain(".env");
    expect(backupOpts.tags).toContain("secrets");
  });

  it("exits on invalid --only category", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await expect(
      backupCommand({ passphrase: "pass", only: "nonexistent" }),
    ).rejects.toThrow("process.exit called");
  });

  it("passes dry-run flag", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass", dryRun: true });

    const backupOpts = mockBackup.mock.calls[0][2];
    expect(backupOpts.dryRun).toBe(true);
  });

  it("skips forget on dry run", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass", dryRun: true });

    expect(mockForget).not.toHaveBeenCalled();
  });

  it("skips forget with --no-forget flag", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass", forget: false });

    expect(mockForget).not.toHaveBeenCalled();
  });

  it("applies retention after backup by default", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass" });

    expect(mockForget).toHaveBeenCalled();
  });

  it("exits when OpenClaw directory not found", async () => {
    mockScanOpenClawDir.mockResolvedValue({
      exists: false,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
    });

    const { backupCommand } = await import("../src/cli/backup.js");
    await expect(backupCommand({ passphrase: "pass" })).rejects.toThrow(
      "process.exit called",
    );
  });

  it("always tags backup with 'clawstash'", async () => {
    const { backupCommand } = await import("../src/cli/backup.js");
    await backupCommand({ passphrase: "pass" });

    const backupOpts = mockBackup.mock.calls[0][2];
    expect(backupOpts.tags).toContain("clawstash");
  });

  it("handles all valid --only categories", async () => {
    const validCategories = [
      "config",
      "secrets",
      "workspace",
      "sessions",
      "memory",
      "skills",
      "agents",
      "settings",
    ];

    const { backupCommand } = await import("../src/cli/backup.js");
    for (const cat of validCategories) {
      mockBackup.mockClear();
      mockForget.mockClear();
      await backupCommand({ passphrase: "pass", only: cat });
      expect(mockBackup).toHaveBeenCalled();
    }
  });
});
