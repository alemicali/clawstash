import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the daemon service file generation logic
const mockExecFileAsync = vi.fn();
const mockWriteFile = vi.fn();
const mockUnlink = vi.fn();
const mockReadFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:util")>();
  return {
    ...actual,
    promisify: () => mockExecFileAsync,
  };
});

vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

let mockServiceManager: "launchd" | "systemd" | "unsupported" = "systemd";

vi.mock("../src/utils/platform.js", () => ({
  getServiceManager: () => mockServiceManager,
  getClawstashDir: () => "/home/user/.clawstash",
}));

vi.mock("../src/utils/fs.js", () => ({
  ensureDir: vi.fn(),
  pathExists: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/core/config.js", () => ({
  requireConfig: () =>
    Promise.resolve({
      daemon: { intervalMinutes: 60 },
    }),
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

describe("daemon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServiceManager = "systemd";
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  describe("daemonInstall", () => {
    it("creates systemd service and timer files on Linux", async () => {
      mockServiceManager = "systemd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      // Should write 2 files: service + timer
      expect(mockWriteFile).toHaveBeenCalledTimes(2);

      const serviceContent = mockWriteFile.mock.calls[0][1] as string;
      const timerContent = mockWriteFile.mock.calls[1][1] as string;

      // Service file checks
      expect(serviceContent).toContain("[Unit]");
      expect(serviceContent).toContain("[Service]");
      expect(serviceContent).toContain("clawstash backup");
      expect(serviceContent).toContain("Type=oneshot");
      expect(serviceContent).toContain("ExecStart=");

      // Timer file checks
      expect(timerContent).toContain("[Timer]");
      expect(timerContent).toContain("OnUnitActiveSec=60min");
      expect(timerContent).toContain("Persistent=true");
    });

    it("creates launchd plist on macOS", async () => {
      mockServiceManager = "launchd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      const plistContent = mockWriteFile.mock.calls[0][1] as string;

      expect(plistContent).toContain("<?xml");
      expect(plistContent).toContain("<plist");
      expect(plistContent).toContain("dev.clawstash.backup");
      expect(plistContent).toContain("clawstash");
      expect(plistContent).toContain("backup");
      expect(plistContent).toContain("<integer>3600</integer>"); // 60 * 60
      expect(plistContent).toContain("RunAtLoad");
    });

    it("reports error on unsupported platform", async () => {
      mockServiceManager = "unsupported";

      const { log } = await import("../src/utils/logger.js");
      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      expect((log.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.stringContaining("Unsupported"),
      );
    });
  });

  describe("daemonUninstall", () => {
    it("removes systemd files and reloads on Linux", async () => {
      mockServiceManager = "systemd";
      mockExecFileAsync.mockResolvedValue({ stdout: "" });

      const { daemonUninstall } = await import("../src/cli/daemon.js");
      await daemonUninstall();

      // Should have called systemctl disable and daemon-reload
      const systemctlCalls = mockExecFileAsync.mock.calls.filter(
        (c: unknown[]) => c[0] === "systemctl",
      );
      expect(systemctlCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("removes launchd plist on macOS", async () => {
      mockServiceManager = "launchd";

      const { daemonUninstall } = await import("../src/cli/daemon.js");
      await daemonUninstall();

      // Should have tried to unload + delete plist
      expect(mockExecFileAsync).toHaveBeenCalled();
    });
  });

  describe("daemonStatus", () => {
    it("checks systemd timer status on Linux", async () => {
      mockServiceManager = "systemd";
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: "Active: active (waiting)\nTrigger: Mon 2026-02-17 16:00:00 UTC",
      });

      const { daemonStatus } = await import("../src/cli/daemon.js");
      await daemonStatus();

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        "systemctl",
        expect.arrayContaining(["--user", "status"]),
      );
    });
  });

  describe("service file content", () => {
    it("systemd timer has OnBootSec for initial delay", async () => {
      mockServiceManager = "systemd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      const timerContent = mockWriteFile.mock.calls[1][1] as string;
      expect(timerContent).toContain("OnBootSec=5min");
    });

    it("systemd service sets PATH", async () => {
      mockServiceManager = "systemd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      const serviceContent = mockWriteFile.mock.calls[0][1] as string;
      expect(serviceContent).toContain("Environment=PATH=");
    });

    it("launchd plist sets PATH environment variable", async () => {
      mockServiceManager = "launchd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      const plistContent = mockWriteFile.mock.calls[0][1] as string;
      expect(plistContent).toContain("EnvironmentVariables");
      expect(plistContent).toContain("PATH");
      expect(plistContent).toContain("/opt/homebrew/bin");
    });

    it("launchd plist logs to daemon.log", async () => {
      mockServiceManager = "launchd";

      const { daemonInstall } = await import("../src/cli/daemon.js");
      await daemonInstall();

      const plistContent = mockWriteFile.mock.calls[0][1] as string;
      expect(plistContent).toContain("daemon.log");
    });
  });
});
