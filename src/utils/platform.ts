import { homedir, platform, arch, tmpdir } from "node:os";
import { join } from "node:path";

export type Platform = "darwin" | "linux" | "win32";
export type Arch = "x64" | "arm64";

export function getPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  throw new Error(`Unsupported platform: ${p}`);
}

export function getArch(): Arch {
  const a = arch();
  if (a === "x64" || a === "arm64") return a;
  throw new Error(`Unsupported architecture: ${a}`);
}

export function getClawstashDir(): string {
  return join(homedir(), ".clawstash");
}

export function getClawstashBinDir(): string {
  return join(getClawstashDir(), "bin");
}

export function getClawstashConfigPath(): string {
  return join(getClawstashDir(), "config.json");
}

export function getDefaultOpenClawDir(): string {
  return join(homedir(), ".openclaw");
}

export function getResticBinaryName(): string {
  return platform() === "win32" ? "restic.exe" : "restic";
}

export function getResticBinaryPath(): string {
  return join(getClawstashBinDir(), getResticBinaryName());
}

export function getTempDir(): string {
  return join(tmpdir(), "clawstash");
}

/**
 * Map platform + arch to restic release asset name.
 * Restic uses: restic_{version}_{os}_{arch}.bz2 (or .zip on Windows)
 */
export function getResticAssetName(version: string): string {
  const p = getPlatform();
  const a = getArch();

  const osMap: Record<Platform, string> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };

  const archMap: Record<Arch, string> = {
    x64: "amd64",
    arm64: "arm64",
  };

  const ext = p === "win32" ? "zip" : "bz2";
  return `restic_${version}_${osMap[p]}_${archMap[a]}.${ext}`;
}

/**
 * Get the service manager for the current platform.
 */
export function getServiceManager(): "launchd" | "systemd" | "unsupported" {
  const p = getPlatform();
  if (p === "darwin") return "launchd";
  if (p === "linux") return "systemd";
  return "unsupported";
}
