import ora from "ora";
import chalk from "chalk";
import { log } from "../utils/logger.js";
import { formatTimeAgo } from "../utils/fs.js";
import { requireConfig } from "../core/config.js";
import { ensureRestic } from "../core/restic-installer.js";
import { listSnapshots } from "../core/restic.js";
import { getPassphrase as getKeychainPassphrase } from "../core/keychain.js";

export interface SnapshotsOptions {
  passphrase?: string;
}

async function resolvePassphrase(opts: SnapshotsOptions): Promise<string> {
  if (opts.passphrase) return opts.passphrase;
  if (process.env.CLAWSTASH_PASSPHRASE) return process.env.CLAWSTASH_PASSPHRASE;
  const fromKeychain = await getKeychainPassphrase();
  if (fromKeychain) return fromKeychain;
  log.error("No passphrase found.");
  log.info("Run `clawstash setup` to save it to keychain, or set CLAWSTASH_PASSPHRASE env var.");
  process.exit(1);
}

export async function snapshotsCommand(opts: SnapshotsOptions): Promise<void> {
  const config = await requireConfig();
  const passphrase = await resolvePassphrase(opts);

  await ensureRestic(config.resticVersion);

  const spinner = ora("Loading snapshots...").start();
  const snapshots = await listSnapshots({
    storage: config.storage,
    passphrase,
  });
  spinner.stop();

  if (snapshots.length === 0) {
    log.info("No snapshots yet. Run `clawstash backup` to create one.");
    return;
  }

  log.header(`Snapshots (${snapshots.length})`);

  // Table header
  const header =
    chalk.dim("  ID        Date                      Tags");
  log.raw(header);
  log.raw(chalk.dim("  " + "-".repeat(60)));

  for (const snap of snapshots) {
    const id = chalk.white(snap.short_id.padEnd(10));
    const date = new Date(snap.time);
    const dateStr = date.toISOString().replace("T", " ").slice(0, 19);
    const ago = chalk.dim(`(${formatTimeAgo(date)})`);
    const tags = snap.tags?.length ? chalk.cyan(snap.tags.join(", ")) : chalk.dim("—");

    log.raw(`  ${id}${dateStr}  ${ago.padEnd(25)} ${tags}`);
  }

  log.blank();
  log.info(chalk.dim(`Restore any snapshot: clawstash restore --at "${snapshots[snapshots.length - 1].short_id}"`));
}
