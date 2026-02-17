import { describe, it, expect, vi, beforeEach } from "vitest";

// We test findSnapshotByTime and getCategoryIncludes logic by extracting behavior
// through the restoreCommand with mocks

vi.mock("ora", () => ({ default: () => ({ start: () => ({ stop: vi.fn(), fail: vi.fn(), succeed: vi.fn() }) }) }));
vi.mock("chalk", () => ({ default: { dim: (s: string) => s } }));
vi.mock("prompts", () => ({
  default: vi.fn().mockResolvedValue({ confirmed: true }),
}));
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
const mockEnsureRestic = vi.fn();
const mockListSnapshots = vi.fn();
const mockRestore = vi.fn();
const mockGetKeychainPassphrase = vi.fn();
const mockPathExists = vi.fn();

vi.mock("../src/core/config.js", () => ({
  requireConfig: (...args: unknown[]) => mockRequireConfig(...args),
}));

vi.mock("../src/core/restic-installer.js", () => ({
  ensureRestic: (...args: unknown[]) => mockEnsureRestic(...args),
}));

vi.mock("../src/core/restic.js", () => ({
  listSnapshots: (...args: unknown[]) => mockListSnapshots(...args),
  restore: (...args: unknown[]) => mockRestore(...args),
}));

vi.mock("../src/core/keychain.js", () => ({
  getPassphrase: (...args: unknown[]) => mockGetKeychainPassphrase(...args),
}));

vi.mock("../src/utils/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/fs.js")>();
  return {
    ...actual,
    pathExists: (...args: unknown[]) => mockPathExists(...args),
  };
});

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

const now = Date.now();
const mockSnapshots = [
  {
    id: "snap1-full-id",
    short_id: "snap1",
    time: new Date(now - 3 * 86_400_000).toISOString(), // 3 days ago
    hostname: "test",
    tags: ["clawstash"],
    paths: ["/home/user/.openclaw"],
  },
  {
    id: "snap2-full-id",
    short_id: "snap2",
    time: new Date(now - 1 * 86_400_000).toISOString(), // 1 day ago
    hostname: "test",
    tags: ["clawstash"],
    paths: ["/home/user/.openclaw"],
  },
  {
    id: "snap3-full-id",
    short_id: "snap3",
    time: new Date(now - 3_600_000).toISOString(), // 1 hour ago
    hostname: "test",
    tags: ["clawstash"],
    paths: ["/home/user/.openclaw"],
  },
];

describe("restoreCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireConfig.mockResolvedValue(mockConfig);
    mockEnsureRestic.mockResolvedValue("/mock/bin/restic");
    mockListSnapshots.mockResolvedValue(mockSnapshots);
    mockRestore.mockResolvedValue(undefined);
    mockGetKeychainPassphrase.mockResolvedValue("keychain-pass");
    mockPathExists.mockResolvedValue(true);
    delete process.env.CLAWSTASH_PASSPHRASE;
  });

  it("restores latest snapshot by default", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({ passphrase: "pass" });

    expect(mockRestore).toHaveBeenCalledWith(
      "snap3-full-id",
      "/home/user/.openclaw",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("restores to custom target directory", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({ passphrase: "pass", target: "/tmp/restore" });

    expect(mockRestore).toHaveBeenCalledWith(
      "snap3-full-id",
      "/tmp/restore",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("exits when no snapshots found", async () => {
    mockListSnapshots.mockResolvedValue([]);

    const { restoreCommand } = await import("../src/cli/restore.js");
    await expect(restoreCommand({ passphrase: "pass" })).rejects.toThrow(
      "process.exit called",
    );
  });

  it("finds closest snapshot for --at with ISO date", async () => {
    // Ask for 2 days ago -> should pick snap2 (1 day ago, closest)
    const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString();
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({ passphrase: "pass", at: twoDaysAgo });

    expect(mockRestore).toHaveBeenCalledWith(
      expect.stringMatching(/snap[12]-full-id/), // Either snap1 or snap2 depending on exact timing
      "/home/user/.openclaw",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("finds closest snapshot for --at with relative time", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({ passphrase: "pass", at: "2 hours ago" });

    // 2 hours ago should be closest to snap3 (1 hour ago)
    expect(mockRestore).toHaveBeenCalledWith(
      "snap3-full-id",
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("passes --only include patterns", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({ passphrase: "pass", only: "secrets" });

    const restoreOpts = mockRestore.mock.calls[0][3];
    expect(restoreOpts.include).toBeDefined();
    expect(restoreOpts.include.length).toBeGreaterThan(0);
  });

  it("exits on invalid --only category", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await expect(
      restoreCommand({ passphrase: "pass", only: "bogus" }),
    ).rejects.toThrow("process.exit called");
  });

  it("resolves passphrase from keychain", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({});

    const restorePassphrase = mockRestore.mock.calls[0][2].passphrase;
    expect(restorePassphrase).toBe("keychain-pass");
  });

  it("resolves passphrase from env var", async () => {
    process.env.CLAWSTASH_PASSPHRASE = "env-pass";

    const { restoreCommand } = await import("../src/cli/restore.js");
    await restoreCommand({});

    const restorePassphrase = mockRestore.mock.calls[0][2].passphrase;
    expect(restorePassphrase).toBe("env-pass");

    delete process.env.CLAWSTASH_PASSPHRASE;
  });

  it("handles relative time formats", async () => {
    const { restoreCommand } = await import("../src/cli/restore.js");

    // These should all work without throwing
    for (const at of ["5 minutes ago", "3 hours ago", "1 day ago", "2 weeks ago", "1 month ago"]) {
      mockRestore.mockClear();
      await restoreCommand({ passphrase: "pass", at });
      expect(mockRestore).toHaveBeenCalled();
    }
  });
});
