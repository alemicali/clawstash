import { chmod, rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getResticBinaryPath,
  getClawstashBinDir,
  getResticAssetName,
  getTempDir,
  getPlatform,
} from "../utils/platform.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { log } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

const RESTIC_GITHUB_RELEASE_URL =
  "https://github.com/restic/restic/releases/download";

/**
 * Check if restic is already installed and working.
 */
export async function isResticInstalled(): Promise<boolean> {
  const binaryPath = getResticBinaryPath();
  if (!(await pathExists(binaryPath))) return false;

  try {
    const { stdout } = await execFileAsync(binaryPath, ["version"]);
    return stdout.includes("restic");
  } catch {
    return false;
  }
}

/**
 * Get the installed restic version, or null if not installed.
 */
export async function getResticVersion(): Promise<string | null> {
  const binaryPath = getResticBinaryPath();
  try {
    const { stdout } = await execFileAsync(binaryPath, ["version"]);
    const match = stdout.match(/restic (\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Download and install restic binary.
 */
export async function installRestic(version: string): Promise<void> {
  const assetName = getResticAssetName(version);
  const url = `${RESTIC_GITHUB_RELEASE_URL}/v${version}/${assetName}`;

  log.info(`Downloading restic v${version}...`);
  log.debug(`URL: ${url}`);

  const tempDir = getTempDir();
  await ensureDir(tempDir);
  await ensureDir(getClawstashBinDir());

  const tempFile = join(tempDir, assetName);
  const binaryPath = getResticBinaryPath();

  // Download
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download restic: ${response.status} ${response.statusText}`,
    );
  }

  const fileStream = createWriteStream(tempFile);
  await pipeline(response.body as unknown as NodeJS.ReadableStream, fileStream);

  // Extract
  const p = getPlatform();
  if (p === "win32") {
    // Windows: .zip file
    const { stdout } = await execFileAsync("powershell", [
      "-Command",
      `Expand-Archive -Path '${tempFile}' -DestinationPath '${tempDir}' -Force`,
    ]);
    log.debug(`Extracted: ${stdout}`);
    const extractedBinary = join(tempDir, "restic.exe");
    await rename(extractedBinary, binaryPath);
  } else {
    // macOS/Linux: .bz2 file
    const extractedFile = join(tempDir, `restic_${version}`);
    await execFileAsync("bzip2", ["-dk", tempFile]);
    // bzip2 removes the .bz2 extension
    const decompressed = tempFile.replace(/\.bz2$/, "");
    await rename(decompressed, binaryPath);
    await chmod(binaryPath, 0o755);
  }

  // Verify
  const installed = await isResticInstalled();
  if (!installed) {
    throw new Error("restic installation failed: binary not functional");
  }

  const installedVersion = await getResticVersion();
  log.success(`restic v${installedVersion} installed at ${binaryPath}`);
}

/**
 * Ensure restic is installed, downloading if necessary.
 */
export async function ensureRestic(version: string): Promise<string> {
  const binaryPath = getResticBinaryPath();

  if (await isResticInstalled()) {
    log.debug(`restic already installed at ${binaryPath}`);
    return binaryPath;
  }

  await installRestic(version);
  return binaryPath;
}
