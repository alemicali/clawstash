import { getResticBinaryPath, getClawstashConfigPath } from "../utils/platform.js";
import { pathExists } from "../utils/fs.js";
import { isResticInstalled, getResticVersion } from "./restic-installer.js";
import { loadConfig, getResticRepoUrl } from "./config.js";
import { checkRepo } from "./restic.js";
import { scanOpenClawDir, isOpenClawRunning } from "./openclaw.js";

export interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
}

/**
 * Run all health checks and return results.
 */
export async function runHealthChecks(passphrase?: string): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // 1. Restic binary
  if (await isResticInstalled()) {
    const version = await getResticVersion();
    checks.push({
      name: "Restic binary",
      status: "ok",
      message: `v${version} (${getResticBinaryPath()})`,
    });
  } else {
    checks.push({
      name: "Restic binary",
      status: "error",
      message: "Not installed. Run `clawstash setup`",
    });
  }

  // 2. Config file
  const config = await loadConfig();
  if (config) {
    checks.push({
      name: "Config",
      status: "ok",
      message: getClawstashConfigPath(),
    });
  } else {
    checks.push({
      name: "Config",
      status: "error",
      message: "Not found. Run `clawstash setup`",
    });
  }

  // 3. OpenClaw directory
  const openclawDir = config?.openclawDir;
  const scan = await scanOpenClawDir(openclawDir);
  if (scan.exists) {
    checks.push({
      name: "OpenClaw directory",
      status: "ok",
      message: `${scan.dir} (${scan.files.length} files)`,
    });
  } else {
    checks.push({
      name: "OpenClaw directory",
      status: "error",
      message: `Not found at ${scan.dir}`,
    });
  }

  // 4. OpenClaw running
  const running = await isOpenClawRunning();
  checks.push({
    name: "OpenClaw gateway",
    status: running ? "warn" : "ok",
    message: running
      ? "Running (SQLite may be locked during backup)"
      : "Not running (safe to backup)",
  });

  // 5. Remote repository
  if (config && passphrase) {
    const repoOk = await checkRepo({
      storage: config.storage,
      passphrase,
    });
    if (repoOk) {
      checks.push({
        name: "Remote repository",
        status: "ok",
        message: getResticRepoUrl(config.storage),
      });
    } else {
      checks.push({
        name: "Remote repository",
        status: "error",
        message: "Cannot reach repository. Check credentials and network.",
      });
    }
  } else if (config && !passphrase) {
    checks.push({
      name: "Remote repository",
      status: "warn",
      message: "Skipped (no passphrase provided, use --passphrase or CLAWSTASH_PASSPHRASE)",
    });
  }

  return checks;
}
