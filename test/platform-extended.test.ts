import { describe, it, expect } from "vitest";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import {
  getPlatform,
  getArch,
  getClawstashDir,
  getClawstashBinDir,
  getClawstashConfigPath,
  getDefaultOpenClawDir,
  getResticBinaryName,
  getResticBinaryPath,
  getTempDir,
  getResticAssetName,
  getServiceManager,
} from "../src/utils/platform.js";

describe("platform utilities", () => {
  describe("getPlatform", () => {
    it("returns a supported platform", () => {
      const p = getPlatform();
      expect(["darwin", "linux", "win32"]).toContain(p);
    });
  });

  describe("getArch", () => {
    it("returns a supported architecture", () => {
      const a = getArch();
      expect(["x64", "arm64"]).toContain(a);
    });
  });

  describe("directory paths", () => {
    it("getClawstashDir returns path in home directory", () => {
      expect(getClawstashDir()).toBe(join(homedir(), ".clawstash"));
    });

    it("getClawstashBinDir is inside clawstash dir", () => {
      expect(getClawstashBinDir()).toBe(join(homedir(), ".clawstash", "bin"));
    });

    it("getClawstashConfigPath is config.json inside clawstash dir", () => {
      expect(getClawstashConfigPath()).toBe(
        join(homedir(), ".clawstash", "config.json"),
      );
    });

    it("getDefaultOpenClawDir returns ~/.openclaw", () => {
      expect(getDefaultOpenClawDir()).toBe(join(homedir(), ".openclaw"));
    });

    it("getTempDir is in system temp", () => {
      expect(getTempDir()).toBe(join(tmpdir(), "clawstash"));
    });
  });

  describe("getResticBinaryName", () => {
    it("returns platform-appropriate binary name", () => {
      const name = getResticBinaryName();
      if (platform() === "win32") {
        expect(name).toBe("restic.exe");
      } else {
        expect(name).toBe("restic");
      }
    });
  });

  describe("getResticBinaryPath", () => {
    it("is inside bin directory", () => {
      const path = getResticBinaryPath();
      expect(path.startsWith(getClawstashBinDir())).toBe(true);
    });
  });

  describe("getResticAssetName", () => {
    it("contains version number", () => {
      const name = getResticAssetName("0.17.3");
      expect(name).toContain("0.17.3");
    });

    it("starts with restic_", () => {
      const name = getResticAssetName("0.17.3");
      expect(name.startsWith("restic_")).toBe(true);
    });

    it("has correct extension based on platform", () => {
      const name = getResticAssetName("0.17.3");
      if (platform() === "win32") {
        expect(name.endsWith(".zip")).toBe(true);
      } else {
        expect(name.endsWith(".bz2")).toBe(true);
      }
    });

    it("uses correct OS name mapping", () => {
      const name = getResticAssetName("0.17.3");
      const p = platform();
      if (p === "darwin") expect(name).toContain("darwin");
      if (p === "linux") expect(name).toContain("linux");
      if (p === "win32") expect(name).toContain("windows");
    });
  });

  describe("getServiceManager", () => {
    it("returns correct service manager for platform", () => {
      const sm = getServiceManager();
      const p = platform();
      if (p === "darwin") expect(sm).toBe("launchd");
      else if (p === "linux") expect(sm).toBe("systemd");
      else expect(sm).toBe("unsupported");
    });
  });
});
