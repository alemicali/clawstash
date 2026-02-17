import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsResticInstalled = vi.fn();
const mockGetResticVersion = vi.fn();
const mockLoadConfig = vi.fn();
const mockCheckRepo = vi.fn();
const mockScanOpenClawDir = vi.fn();
const mockIsOpenClawRunning = vi.fn();
const mockPathExists = vi.fn();

vi.mock("../src/core/restic-installer.js", () => ({
  isResticInstalled: (...args: unknown[]) => mockIsResticInstalled(...args),
  getResticVersion: (...args: unknown[]) => mockGetResticVersion(...args),
}));

vi.mock("../src/core/config.js", () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  getResticRepoUrl: (storage: { provider: string; bucket: string; accountId?: string }) =>
    `s3:https://${storage.accountId}.r2.cloudflarestorage.com/${storage.bucket}`,
}));

vi.mock("../src/core/restic.js", () => ({
  checkRepo: (...args: unknown[]) => mockCheckRepo(...args),
}));

vi.mock("../src/core/openclaw.js", () => ({
  scanOpenClawDir: (...args: unknown[]) => mockScanOpenClawDir(...args),
  isOpenClawRunning: (...args: unknown[]) => mockIsOpenClawRunning(...args),
}));

vi.mock("../src/utils/platform.js", () => ({
  getResticBinaryPath: () => "/mock/bin/restic",
  getClawstashConfigPath: () => "/mock/.clawstash/config.json",
}));

vi.mock("../src/utils/fs.js", () => ({
  pathExists: (...args: unknown[]) => mockPathExists(...args),
}));

describe("health checks", () => {
  beforeEach(() => {
    mockIsResticInstalled.mockReset();
    mockGetResticVersion.mockReset();
    mockLoadConfig.mockReset();
    mockCheckRepo.mockReset();
    mockScanOpenClawDir.mockReset();
    mockIsOpenClawRunning.mockReset();
  });

  it("returns all OK when everything is healthy", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue({
      openclawDir: "/home/user/.openclaw",
      storage: { provider: "r2", bucket: "test", accountId: "abc", accessKeyId: "k", secretAccessKey: "s" },
    });
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [{ path: "/a", relativePath: "a", size: 100, category: "config" }],
      totalSize: 100,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);
    mockCheckRepo.mockResolvedValue(true);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks("test-pass");

    expect(checks.length).toBeGreaterThanOrEqual(4);

    const resticCheck = checks.find((c) => c.name === "Restic binary");
    expect(resticCheck?.status).toBe("ok");
    expect(resticCheck?.message).toContain("0.17.3");

    const configCheck = checks.find((c) => c.name === "Config");
    expect(configCheck?.status).toBe("ok");

    const openclawCheck = checks.find((c) => c.name === "OpenClaw directory");
    expect(openclawCheck?.status).toBe("ok");

    const gatewayCheck = checks.find((c) => c.name === "OpenClaw gateway");
    expect(gatewayCheck?.status).toBe("ok");
    expect(gatewayCheck?.message).toContain("Not running");

    const repoCheck = checks.find((c) => c.name === "Remote repository");
    expect(repoCheck?.status).toBe("ok");
  });

  it("reports error when restic is not installed", async () => {
    mockIsResticInstalled.mockResolvedValue(false);
    mockLoadConfig.mockResolvedValue(null);
    mockScanOpenClawDir.mockResolvedValue({
      exists: false,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks();

    const resticCheck = checks.find((c) => c.name === "Restic binary");
    expect(resticCheck?.status).toBe("error");
    expect(resticCheck?.message).toContain("Not installed");
  });

  it("reports error when config is missing", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue(null);
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks();

    const configCheck = checks.find((c) => c.name === "Config");
    expect(configCheck?.status).toBe("error");
    expect(configCheck?.message).toContain("Not found");
  });

  it("reports error when OpenClaw dir does not exist", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue({
      openclawDir: "/home/user/.openclaw",
      storage: { provider: "r2", bucket: "test", accountId: "abc", accessKeyId: "k", secretAccessKey: "s" },
    });
    mockScanOpenClawDir.mockResolvedValue({
      exists: false,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);
    mockCheckRepo.mockResolvedValue(true);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks("pass");

    const openclawCheck = checks.find((c) => c.name === "OpenClaw directory");
    expect(openclawCheck?.status).toBe("error");
  });

  it("warns when OpenClaw is running", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue(null);
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(true);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks();

    const gatewayCheck = checks.find((c) => c.name === "OpenClaw gateway");
    expect(gatewayCheck?.status).toBe("warn");
    expect(gatewayCheck?.message).toContain("Running");
  });

  it("warns when no passphrase provided for repo check", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue({
      openclawDir: "/home/user/.openclaw",
      storage: { provider: "r2", bucket: "test", accountId: "abc", accessKeyId: "k", secretAccessKey: "s" },
    });
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks(); // no passphrase

    const repoCheck = checks.find((c) => c.name === "Remote repository");
    expect(repoCheck?.status).toBe("warn");
    expect(repoCheck?.message).toContain("Skipped");
  });

  it("reports error when repo is unreachable", async () => {
    mockIsResticInstalled.mockResolvedValue(true);
    mockGetResticVersion.mockResolvedValue("0.17.3");
    mockLoadConfig.mockResolvedValue({
      openclawDir: "/home/user/.openclaw",
      storage: { provider: "r2", bucket: "test", accountId: "abc", accessKeyId: "k", secretAccessKey: "s" },
    });
    mockScanOpenClawDir.mockResolvedValue({
      exists: true,
      dir: "/home/user/.openclaw",
      files: [],
      totalSize: 0,
      categories: {},
    });
    mockIsOpenClawRunning.mockResolvedValue(false);
    mockCheckRepo.mockResolvedValue(false);

    const { runHealthChecks } = await import("../src/core/health.js");
    const checks = await runHealthChecks("pass");

    const repoCheck = checks.find((c) => c.name === "Remote repository");
    expect(repoCheck?.status).toBe("error");
    expect(repoCheck?.message).toContain("Cannot reach");
  });
});
