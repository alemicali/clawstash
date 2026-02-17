import ora from "ora";
import chalk from "chalk";
import { log } from "../utils/logger.js";
import { formatBytes, formatDuration } from "../utils/fs.js";
import { requireConfig } from "../core/config.js";
import { scanOpenClawDir, DEFAULT_EXCLUDES, isOpenClawRunning } from "../core/openclaw.js";
import { ensureRestic } from "../core/restic-installer.js";
import { backup, forget } from "../core/restic.js";
import { getPassphrase as getKeychainPassphrase } from "../core/keychain.js";

export interface BackupOptions {
  passphrase?: string;
  only?: string;
  dryRun?: boolean;
  /** Commander's --no-forget sets this to false (default true) */
  forget?: boolean;
}

async function resolvePassphrase(opts: BackupOptions): Promise<string> {
  // 1. Explicit flag
  if (opts.passphrase) return opts.passphrase;

  // 2. Environment variable
  if (process.env.CLAWSTASH_PASSPHRASE) return process.env.CLAWSTASH_PASSPHRASE;

  // 3. System keychain
  const fromKeychain = await getKeychainPassphrase();
  if (fromKeychain) {
    log.debug("Passphrase loaded from system keychain");
    return fromKeychain;
  }

  // 4. Give up
  log.error("No passphrase found.");
  log.info("Options:");
  log.info("  1. Save to keychain:  clawstash setup");
  log.info("  2. Set env var:       export CLAWSTASH_PASSPHRASE=...");
  log.info("  3. Pass flag:         --passphrase ...");
  process.exit(1);
}

/**
 * Map --only flag to restic include paths.
 */
function getCategoryIncludes(only?: string): string[] | undefined {
  if (!only) return undefined;

  const map: Record<string, string[]> = {
    config: ["openclaw.json", "openclaw.json5", ".env"],
    secrets: ["credentials/**", "auth/**", ".env"],
    workspace: ["workspace/**", "workspace-*/**"],
    sessions: ["agents/*/sessions/**"],
    memory: ["memory/**"],
    skills: ["skills/**", "workspace/skills/**"],
    agents: ["agents/*/agent/**"],
    settings: ["settings/**"],
  };

  const includes = map[only];
  if (!includes) {
    log.error(`Unknown category: ${only}`);
    log.info(`Valid categories: ${Object.keys(map).join(", ")}`);
    process.exit(1);
  }

  return includes;
}

export async function backupCommand(opts: BackupOptions): Promise<void> {
  const config = await requireConfig();
  const passphrase = await resolvePassphrase(opts);

  // Ensure restic
  await ensureRestic(config.resticVersion);

  // Scan OpenClaw directory
  const scan = await scanOpenClawDir(config.openclawDir);
  if (!scan.exists) {
    log.error(`OpenClaw directory not found: ${config.openclawDir}`);
    process.exit(1);
  }

  // Warn if OpenClaw is running
  const running = await isOpenClawRunning();
  if (running) {
    log.warn("OpenClaw gateway is running. SQLite files may be locked.");
    log.info(chalk.dim("Backup will proceed but SQLite data may be inconsistent."));
    log.info(chalk.dim("For best results, stop OpenClaw first: openclaw gateway stop"));
    log.blank();
  }

  // Build excludes
  const excludes = [...DEFAULT_EXCLUDES, ...config.exclude];

  // Build tags
  const tags = ["clawstash"];
  if (opts.only) tags.push(opts.only);

  // Build includes (for --only filtering)
  const includes = getCategoryIncludes(opts.only);

  // Run backup
  const spinner = ora(
    opts.dryRun ? "Calculating backup (dry run)..." : "Backing up...",
  ).start();

  try {
    const summary = await backup(config.openclawDir, {
      storage: config.storage,
      passphrase,
    }, {
      tags,
      excludes,
      includes,
      dryRun: opts.dryRun,
    });

    spinner.stop();

    const totalFiles = summary.files_new + summary.files_changed + summary.files_unmodified;
    const changedFiles = summary.files_new + summary.files_changed;

    log.blank();
    if (opts.dryRun) {
      log.header("Dry run complete");
    } else {
      log.header("Backup complete");
    }

    log.kv("Snapshot", summary.snapshot_id.slice(0, 8), "ok");
    log.kv("Files", `${totalFiles} total, ${changedFiles} changed`);
    log.kv("Data added", formatBytes(summary.data_added));
    log.kv("Processed", formatBytes(summary.total_bytes_processed));
    log.kv("Duration", formatDuration(summary.total_duration));

  } catch (err) {
    spinner.fail("Backup failed");
    log.error(String(err));
    process.exit(1);
  }

  // Apply retention policy (unless --no-forget)
  if (!opts.dryRun && opts.forget !== false) {
    const forgetSpinner = ora("Applying retention policy...").start();
    try {
      await forget(
        { storage: config.storage, passphrase },
        config.retention,
      );
      forgetSpinner.succeed("Retention policy applied");
    } catch (err) {
      forgetSpinner.warn("Retention policy failed (backup was successful)");
      log.debug(String(err));
    }
  }
}
