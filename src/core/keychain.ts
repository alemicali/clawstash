import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, unlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { getPlatform, getClawstashDir } from "../utils/platform.js";
import { log } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

const SERVICE_NAME = "clawstash";
const ACCOUNT_NAME = "backup-passphrase";

function getPassphraseFilePath(): string {
  return join(getClawstashDir(), "passphrase");
}

// ─── File-based fallback (permissions 0600) ──────────────────────────────────

async function savePassphraseToFile(passphrase: string): Promise<boolean> {
  try {
    const filePath = getPassphraseFilePath();
    await writeFile(filePath, passphrase, "utf-8");
    await chmod(filePath, 0o600);
    log.debug(`Passphrase saved to ${filePath} (mode 600)`);
    return true;
  } catch (err) {
    log.debug(`Failed to save passphrase to file: ${err}`);
    return false;
  }
}

async function readPassphraseFromFile(): Promise<string | null> {
  try {
    const filePath = getPassphraseFilePath();
    const content = await readFile(filePath, "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

async function deletePassphraseFile(): Promise<boolean> {
  try {
    await unlink(getPassphraseFilePath());
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Store passphrase in the system keychain.
 * Falls back to ~/.clawstash/passphrase (mode 600) if keychain is unavailable.
 *
 * - macOS: Keychain Access via `security` CLI
 * - Linux: GNOME Keyring / KDE Wallet via `secret-tool` CLI
 * - Fallback: ~/.clawstash/passphrase file
 */
export async function setPassphrase(passphrase: string): Promise<boolean> {
  const platform = getPlatform();

  try {
    if (platform === "darwin") {
      // Delete existing entry first (ignore errors if not found)
      try {
        await execFileAsync("security", [
          "delete-generic-password",
          "-s", SERVICE_NAME,
          "-a", ACCOUNT_NAME,
        ]);
      } catch {
        // Not found — fine
      }

      await execFileAsync("security", [
        "add-generic-password",
        "-s", SERVICE_NAME,
        "-a", ACCOUNT_NAME,
        "-w", passphrase,
        "-U", // Update if exists
      ]);
      return true;
    }

    if (platform === "linux") {
      const child = execFile("secret-tool", [
        "store",
        "--label", "clawstash backup passphrase",
        "service", SERVICE_NAME,
        "account", ACCOUNT_NAME,
      ]);

      // secret-tool reads the secret from stdin
      child.stdin?.write(passphrase);
      child.stdin?.end();

      await new Promise<void>((resolve, reject) => {
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`secret-tool exited with code ${code}`));
        });
        child.on("error", reject);
      });
      return true;
    }

    log.debug(`Keychain not supported on ${platform}, using file fallback`);
    return savePassphraseToFile(passphrase);
  } catch (err) {
    log.debug(`Keychain store failed: ${err}, using file fallback`);
    return savePassphraseToFile(passphrase);
  }
}

/**
 * Retrieve passphrase from the system keychain.
 * Falls back to ~/.clawstash/passphrase if keychain is unavailable.
 */
export async function getPassphrase(): Promise<string | null> {
  const platform = getPlatform();

  try {
    if (platform === "darwin") {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s", SERVICE_NAME,
        "-a", ACCOUNT_NAME,
        "-w", // Output password only
      ]);
      const passphrase = stdout.trim();
      if (passphrase) return passphrase;
    }

    if (platform === "linux") {
      try {
        const { stdout } = await execFileAsync("secret-tool", [
          "lookup",
          "service", SERVICE_NAME,
          "account", ACCOUNT_NAME,
        ]);
        const passphrase = stdout.trim();
        if (passphrase) return passphrase;
      } catch {
        // secret-tool not available or no entry, fall through to file
      }
    }
  } catch {
    // keychain failed, fall through to file
  }

  // Fallback: read from file
  return readPassphraseFromFile();
}

/**
 * Delete passphrase from the system keychain and/or file.
 */
export async function deletePassphrase(): Promise<boolean> {
  const platform = getPlatform();
  let deleted = false;

  try {
    if (platform === "darwin") {
      await execFileAsync("security", [
        "delete-generic-password",
        "-s", SERVICE_NAME,
        "-a", ACCOUNT_NAME,
      ]);
      deleted = true;
    }

    if (platform === "linux") {
      try {
        await execFileAsync("secret-tool", [
          "clear",
          "service", SERVICE_NAME,
          "account", ACCOUNT_NAME,
        ]);
        deleted = true;
      } catch {
        // secret-tool not available
      }
    }
  } catch {
    // keychain delete failed
  }

  // Also delete from file
  const fileDeleted = await deletePassphraseFile();
  return deleted || fileDeleted;
}

/**
 * Check if keychain is available on this system.
 */
export async function isKeychainAvailable(): Promise<boolean> {
  const platform = getPlatform();

  try {
    if (platform === "darwin") {
      await execFileAsync("security", ["help"]);
      return true;
    }

    if (platform === "linux") {
      await execFileAsync("which", ["secret-tool"]);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
