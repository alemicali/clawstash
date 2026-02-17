import ora from "ora";
import chalk from "chalk";
import { log } from "../utils/logger.js";
import { formatBytes, formatTimeAgo } from "../utils/fs.js";
import { loadConfig, getResticRepoUrl } from "../core/config.js";
import { scanOpenClawDir } from "../core/openclaw.js";
import { ensureRestic } from "../core/restic-installer.js";
import { listSnapshots, stats } from "../core/restic.js";
import { getPassphrase as getKeychainPassphrase } from "../core/keychain.js";

export interface StatusOptions {
  passphrase?: string;
}

export async function statusCommand(opts: StatusOptions): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    log.error("clawstash is not configured. Run `clawstash setup` first.");
    process.exit(1);
  }

  log.header("clawstash status");

  // OpenClaw scan
  const scan = await scanOpenClawDir(config.openclawDir);
  log.kv("OpenClaw dir", scan.exists ? `${scan.dir} (${scan.files.length} files)` : "Not found", scan.exists ? "ok" : "error");
  if (scan.exists) {
    log.kv("Local size", formatBytes(scan.totalSize));
  }

  // Storage info
  log.kv("Storage", `${config.storage.provider.toUpperCase()} / ${config.storage.bucket}`);
  log.kv("Repository", getResticRepoUrl(config.storage));

  const passphrase = opts.passphrase
    ?? process.env.CLAWSTASH_PASSPHRASE
    ?? await getKeychainPassphrase();

  if (!passphrase) {
    log.blank();
    log.kv("Snapshots", "Skipped (no passphrase)", "warn");
    log.info(chalk.dim("Set CLAWSTASH_PASSPHRASE or save to keychain via `clawstash setup`."));
    return;
  }

  await ensureRestic(config.resticVersion);

  // Fetch remote info
  const spinner = ora("Checking remote...").start();

  try {
    const [snapshots, repoStats] = await Promise.all([
      listSnapshots({ storage: config.storage, passphrase }),
      stats({ storage: config.storage, passphrase }),
    ]);

    spinner.stop();

    log.blank();

    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      const latestDate = new Date(latest.time);
      log.kv("Last backup", `${formatTimeAgo(latestDate)} (${latest.short_id})`, "ok");
      log.kv("Total snapshots", String(snapshots.length));
    } else {
      log.kv("Last backup", "Never", "warn");
    }

    log.kv("Repo size", formatBytes(repoStats.total_size));

    // Retention info
    log.blank();
    log.kv("Retention", [
      `${config.retention.keepLast} latest`,
      `${config.retention.keepDaily} daily`,
      `${config.retention.keepWeekly} weekly`,
      `${config.retention.keepMonthly} monthly`,
    ].join(", "));

    // Daemon info
    if (config.daemon.enabled) {
      log.kv("Auto-backup", `Every ${config.daemon.intervalMinutes} minutes`, "ok");
    } else {
      log.kv("Auto-backup", "Disabled (manual only)", "warn");
    }

  } catch (err) {
    spinner.fail("Failed to check remote");
    log.error(String(err));
  }
}
