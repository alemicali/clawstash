import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecFileAsync = vi.fn();
const mockPathExists = vi.fn();

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

vi.mock("../src/utils/platform.js", () => ({
  getResticBinaryPath: () => "/mock/.clawstash/bin/restic",
  getClawstashBinDir: () => "/mock/.clawstash/bin",
  getResticAssetName: (v: string) => `restic_${v}_linux_amd64.bz2`,
  getTempDir: () => "/tmp/clawstash",
  getPlatform: () => "linux",
}));

vi.mock("../src/utils/fs.js", () => ({
  pathExists: (...args: unknown[]) => mockPathExists(...args),
  ensureDir: vi.fn(),
}));

vi.mock("../src/utils/logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("restic-installer", () => {
  beforeEach(() => {
    vi.resetModules();
    mockExecFileAsync.mockReset();
    mockPathExists.mockReset();
  });

  describe("isResticInstalled", () => {
    it("returns true when binary exists and works", async () => {
      mockPathExists.mockResolvedValueOnce(true);
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "restic 0.17.3" });

      const { isResticInstalled } = await import("../src/core/restic-installer.js");
      const result = await isResticInstalled();
      expect(result).toBe(true);
    });

    it("returns false when binary does not exist", async () => {
      mockPathExists.mockResolvedValueOnce(false);

      const { isResticInstalled } = await import("../src/core/restic-installer.js");
      const result = await isResticInstalled();
      expect(result).toBe(false);
    });

    it("returns false when binary exists but is not functional", async () => {
      mockPathExists.mockResolvedValueOnce(true);
      mockExecFileAsync.mockRejectedValueOnce(new Error("permission denied"));

      const { isResticInstalled } = await import("../src/core/restic-installer.js");
      const result = await isResticInstalled();
      expect(result).toBe(false);
    });

    it("returns false when binary outputs unexpected text", async () => {
      mockPathExists.mockResolvedValueOnce(true);
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "unknown binary v1.0" });

      const { isResticInstalled } = await import("../src/core/restic-installer.js");
      const result = await isResticInstalled();
      expect(result).toBe(false);
    });
  });

  describe("getResticVersion", () => {
    it("parses version from output", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "restic 0.17.3 compiled with go1.22" });

      const { getResticVersion } = await import("../src/core/restic-installer.js");
      const version = await getResticVersion();
      expect(version).toBe("0.17.3");
    });

    it("returns null on error", async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error("not found"));

      const { getResticVersion } = await import("../src/core/restic-installer.js");
      const version = await getResticVersion();
      expect(version).toBeNull();
    });

    it("returns null when version pattern not found", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "some random output" });

      const { getResticVersion } = await import("../src/core/restic-installer.js");
      const version = await getResticVersion();
      expect(version).toBeNull();
    });
  });

  describe("ensureRestic", () => {
    it("returns early if already installed", async () => {
      // isResticInstalled => true
      mockPathExists.mockResolvedValueOnce(true);
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "restic 0.17.3" });

      const { ensureRestic } = await import("../src/core/restic-installer.js");
      const result = await ensureRestic("0.17.3");
      expect(result).toBe("/mock/.clawstash/bin/restic");
    });
  });
});
