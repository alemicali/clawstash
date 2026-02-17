import ora from "ora";
import { log } from "../utils/logger.js";
import { requireConfig } from "../core/config.js";
import { ensureRestic } from "../core/restic-installer.js";
import { forget, listSnapshots } from "../core/restic.js";
import { getPassphrase as getKeychainPassphrase } from "../core/keychain.js";

export interface ForgetOptions {
  passphrase?: string;
}

async function resolvePassphrase(opts: ForgetOptions): Promise<string> {
  if (opts.passphrase) return opts.passphrase;
  if (process.env.CLAWSTASH_PASSPHRASE) return process.env.CLAWSTASH_PASSPHRASE;
  const fromKeychain = await getKeychainPassphrase();
  if (fromKeychain) return fromKeychain;
  log.error("No passphrase found.");
  log.info("Run `clawstash setup` to save it to keychain, or set CLAWSTASH_PASSPHRASE env var.");
  process.exit(1);
}

export async function forgetCommand(opts: ForgetOptions): Promise<void> {
  const config = await requireConfig();
  const passphrase = await resolvePassphrase(opts);

  await ensureRestic(config.resticVersion);

  const resticOpts = { storage: config.storage, passphrase };

  // Count before
  const before = await listSnapshots(resticOpts);

  const spinner = ora("Applying retention policy and pruning...").start();

  try {
    await forget(resticOpts, config.retention);
    spinner.stop();

    // Count after
    const after = await listSnapshots(resticOpts);
    const removed = before.length - after.length;

    log.blank();
    log.header("Retention applied");
    log.kv("Before", `${before.length} snapshots`);
    log.kv("After", `${after.length} snapshots`);
    log.kv("Removed", `${removed} snapshots`, removed > 0 ? "ok" : undefined);
  } catch (err) {
    spinner.fail("Failed to apply retention policy");
    log.error(String(err));
    process.exit(1);
  }
}
