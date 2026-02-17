import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process and platform before importing
const mockExecFile = vi.fn();
const mockExecFileAsync = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const result = mockExecFile(...args);
    return result;
  },
}));

vi.mock("node:util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:util")>();
  return {
    ...actual,
    promisify: () => mockExecFileAsync,
  };
});

let mockPlatform = "linux";
vi.mock("../src/utils/platform.js", () => ({
  getPlatform: () => mockPlatform,
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

describe("keychain", () => {
  beforeEach(() => {
    vi.resetModules();
    mockExecFile.mockReset();
    mockExecFileAsync.mockReset();
    mockPlatform = "linux";
  });

  describe("setPassphrase", () => {
    it("stores passphrase on macOS using security CLI", async () => {
      mockPlatform = "darwin";
      // First call: delete existing (may fail)
      mockExecFileAsync.mockResolvedValueOnce({});
      // Second call: add-generic-password
      mockExecFileAsync.mockResolvedValueOnce({});

      const { setPassphrase } = await import("../src/core/keychain.js");
      const result = await setPassphrase("my-secret");
      expect(result).toBe(true);

      // First call is delete-generic-password
      expect(mockExecFileAsync).toHaveBeenCalledWith("security", [
        "delete-generic-password",
        "-s", "clawstash",
        "-a", "backup-passphrase",
      ]);
      // Second call is add-generic-password
      expect(mockExecFileAsync).toHaveBeenCalledWith("security", [
        "add-generic-password",
        "-s", "clawstash",
        "-a", "backup-passphrase",
        "-w", "my-secret",
        "-U",
      ]);
    });

    it("stores passphrase on Linux using secret-tool", async () => {
      mockPlatform = "linux";

      // Mock execFile (non-promisified) for Linux path
      const mockStdin = { write: vi.fn(), end: vi.fn() };
      const mockChild = {
        stdin: mockStdin,
        on: vi.fn((event: string, cb: (code?: number) => void) => {
          if (event === "close") {
            // Simulate success
            setTimeout(() => cb(0), 0);
          }
        }),
      };
      mockExecFile.mockReturnValue(mockChild);

      const { setPassphrase } = await import("../src/core/keychain.js");
      const result = await setPassphrase("linux-secret");
      expect(result).toBe(true);

      expect(mockExecFile).toHaveBeenCalledWith("secret-tool", [
        "store",
        "--label", "clawstash backup passphrase",
        "service", "clawstash",
        "account", "backup-passphrase",
      ]);
      expect(mockStdin.write).toHaveBeenCalledWith("linux-secret");
      expect(mockStdin.end).toHaveBeenCalled();
    });

    it("returns false on unsupported platform", async () => {
      mockPlatform = "win32" as "linux";
      const { setPassphrase } = await import("../src/core/keychain.js");
      const result = await setPassphrase("test");
      expect(result).toBe(false);
    });

    it("returns false when macOS security CLI fails", async () => {
      mockPlatform = "darwin";
      // delete fails (fine)
      mockExecFileAsync.mockRejectedValueOnce(new Error("not found"));
      // add fails (not fine)
      mockExecFileAsync.mockRejectedValueOnce(new Error("access denied"));

      const { setPassphrase } = await import("../src/core/keychain.js");
      const result = await setPassphrase("test");
      expect(result).toBe(false);
    });
  });

  describe("getPassphrase", () => {
    it("retrieves passphrase from macOS keychain", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "my-secret\n" });

      const { getPassphrase } = await import("../src/core/keychain.js");
      const result = await getPassphrase();
      expect(result).toBe("my-secret");

      expect(mockExecFileAsync).toHaveBeenCalledWith("security", [
        "find-generic-password",
        "-s", "clawstash",
        "-a", "backup-passphrase",
        "-w",
      ]);
    });

    it("retrieves passphrase from Linux keychain", async () => {
      mockPlatform = "linux";
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "linux-secret\n" });

      const { getPassphrase } = await import("../src/core/keychain.js");
      const result = await getPassphrase();
      expect(result).toBe("linux-secret");

      expect(mockExecFileAsync).toHaveBeenCalledWith("secret-tool", [
        "lookup",
        "service", "clawstash",
        "account", "backup-passphrase",
      ]);
    });

    it("returns null when not found", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockRejectedValueOnce(new Error("not found"));

      const { getPassphrase } = await import("../src/core/keychain.js");
      const result = await getPassphrase();
      expect(result).toBeNull();
    });

    it("returns null for empty stdout", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "  \n" });

      const { getPassphrase } = await import("../src/core/keychain.js");
      const result = await getPassphrase();
      expect(result).toBeNull();
    });

    it("returns null on unsupported platform", async () => {
      mockPlatform = "win32" as "linux";
      const { getPassphrase } = await import("../src/core/keychain.js");
      const result = await getPassphrase();
      expect(result).toBeNull();
    });
  });

  describe("deletePassphrase", () => {
    it("deletes from macOS keychain", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockResolvedValueOnce({});

      const { deletePassphrase } = await import("../src/core/keychain.js");
      const result = await deletePassphrase();
      expect(result).toBe(true);

      expect(mockExecFileAsync).toHaveBeenCalledWith("security", [
        "delete-generic-password",
        "-s", "clawstash",
        "-a", "backup-passphrase",
      ]);
    });

    it("deletes from Linux keychain", async () => {
      mockPlatform = "linux";
      mockExecFileAsync.mockResolvedValueOnce({});

      const { deletePassphrase } = await import("../src/core/keychain.js");
      const result = await deletePassphrase();
      expect(result).toBe(true);

      expect(mockExecFileAsync).toHaveBeenCalledWith("secret-tool", [
        "clear",
        "service", "clawstash",
        "account", "backup-passphrase",
      ]);
    });

    it("returns false when delete fails", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockRejectedValueOnce(new Error("not found"));

      const { deletePassphrase } = await import("../src/core/keychain.js");
      const result = await deletePassphrase();
      expect(result).toBe(false);
    });

    it("returns false on unsupported platform", async () => {
      mockPlatform = "win32" as "linux";
      const { deletePassphrase } = await import("../src/core/keychain.js");
      const result = await deletePassphrase();
      expect(result).toBe(false);
    });
  });

  describe("isKeychainAvailable", () => {
    it("returns true on macOS when security exists", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockResolvedValueOnce({});

      const { isKeychainAvailable } = await import("../src/core/keychain.js");
      const result = await isKeychainAvailable();
      expect(result).toBe(true);

      expect(mockExecFileAsync).toHaveBeenCalledWith("security", ["help"]);
    });

    it("returns true on Linux when secret-tool exists", async () => {
      mockPlatform = "linux";
      mockExecFileAsync.mockResolvedValueOnce({});

      const { isKeychainAvailable } = await import("../src/core/keychain.js");
      const result = await isKeychainAvailable();
      expect(result).toBe(true);

      expect(mockExecFileAsync).toHaveBeenCalledWith("which", ["secret-tool"]);
    });

    it("returns false when security not found", async () => {
      mockPlatform = "darwin";
      mockExecFileAsync.mockRejectedValueOnce(new Error("not found"));

      const { isKeychainAvailable } = await import("../src/core/keychain.js");
      const result = await isKeychainAvailable();
      expect(result).toBe(false);
    });

    it("returns false on unsupported platform", async () => {
      mockPlatform = "win32" as "linux";
      const { isKeychainAvailable } = await import("../src/core/keychain.js");
      const result = await isKeychainAvailable();
      expect(result).toBe(false);
    });
  });
});
