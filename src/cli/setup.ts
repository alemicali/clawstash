import prompts from "prompts";
import ora from "ora";
import chalk from "chalk";
import { log } from "../utils/logger.js";
import { getDefaultOpenClawDir } from "../utils/platform.js";
import { scanOpenClawDir, formatScanResult } from "../core/openclaw.js";
import { ensureRestic } from "../core/restic-installer.js";
import { initRepo, checkRepo } from "../core/restic.js";
import { ensureBucket, detectR2Jurisdiction } from "../core/s3.js";
import {
  saveConfig,
  loadConfig,
  DEFAULT_RETENTION,
  DEFAULT_DAEMON,
  CURRENT_RESTIC_VERSION,
  type ClawstashConfig,
  type StorageConfig,
} from "../core/config.js";

export async function setupCommand(): Promise<void> {
  log.header("clawstash setup");

  // Check if already configured
  const existing = await loadConfig();
  if (existing) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "clawstash is already configured. Reconfigure?",
      initial: false,
    });
    if (!overwrite) {
      log.info("Setup cancelled.");
      return;
    }
  }

  // ── Step 1: Detect OpenClaw ──────────────────────────────────────────────

  log.info(chalk.dim("[1/5]") + " Detecting OpenClaw...");
  log.blank();

  const scan = await scanOpenClawDir();
  if (!scan.exists) {
    const { customDir } = await prompts({
      type: "text",
      name: "customDir",
      message: "OpenClaw directory not found at ~/.openclaw. Enter path:",
      initial: getDefaultOpenClawDir(),
    });
    const rescan = await scanOpenClawDir(customDir);
    if (!rescan.exists) {
      log.error(`Directory not found: ${customDir}`);
      log.info("Install OpenClaw first: npm install -g openclaw");
      process.exit(1);
    }
    log.raw(formatScanResult(rescan));
  } else {
    log.raw(formatScanResult(scan));
  }

  log.blank();

  // ── Step 2: Storage provider ─────────────────────────────────────────────

  log.info(chalk.dim("[2/5]") + " Storage provider");
  log.blank();

  const { provider } = await prompts({
    type: "select",
    name: "provider",
    message: "Where should backups be stored?",
    choices: [
      { title: "Cloudflare R2", description: "S3-compatible, generous free tier", value: "r2" },
      { title: "AWS S3", description: "Amazon S3", value: "s3" },
      { title: "Backblaze B2", description: "Affordable S3-compatible storage", value: "b2" },
      { title: "MinIO / Custom S3", description: "Self-hosted or custom endpoint", value: "minio" },
    ],
  });

  if (!provider) {
    log.info("Setup cancelled.");
    return;
  }

  // ── Step 3: Credentials ──────────────────────────────────────────────────

  log.blank();
  log.info(chalk.dim("[3/5]") + ` ${provider.toUpperCase()} credentials`);
  log.blank();

  const storageQuestions: prompts.PromptObject[] = [];

  if (provider === "r2") {
    storageQuestions.push({
      type: "text",
      name: "accountId",
      message: "Cloudflare Account ID:",
      validate: (v: string) => v.length > 0 || "Required",
    });
  }

  if (provider === "s3") {
    storageQuestions.push({
      type: "text",
      name: "region",
      message: "AWS Region:",
      initial: "us-east-1",
    });
  }

  if (provider === "b2") {
    storageQuestions.push({
      type: "text",
      name: "endpoint",
      message: "B2 S3 endpoint:",
      initial: "https://s3.us-west-004.backblazeb2.com",
      validate: (v: string) => v.startsWith("http") || "Must be a full URL (https://...)",
    });
  }

  if (provider === "minio") {
    storageQuestions.push({
      type: "text",
      name: "endpoint",
      message: "S3 endpoint URL:",
      validate: (v: string) => v.startsWith("http") || "Must be a full URL (https://...)",
    });
  }

  storageQuestions.push(
    {
      type: "text",
      name: "accessKeyId",
      message: "Access Key ID:",
      validate: (v: string) => v.length > 0 || "Required",
    },
    {
      type: "password",
      name: "secretAccessKey",
      message: "Secret Access Key:",
      validate: (v: string) => v.length > 0 || "Required",
    },
    {
      type: "text",
      name: "bucket",
      message: "Bucket name:",
      initial: "clawstash-backup",
      validate: (v: string) => /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v) || "Invalid bucket name",
    },
  );

  const storageAnswers = await prompts(storageQuestions);

  // Auto-detect R2 jurisdiction (EU vs default)
  let r2Jurisdiction = "";
  if (provider === "r2" && storageAnswers.accountId) {
    const detectSpinner = ora("Detecting R2 region...").start();
    r2Jurisdiction = await detectR2Jurisdiction(
      storageAnswers.accountId,
      storageAnswers.accessKeyId,
      storageAnswers.secretAccessKey,
    );
    if (r2Jurisdiction) {
      detectSpinner.succeed(`R2 region: ${r2Jurisdiction.toUpperCase()}`);
    } else {
      detectSpinner.succeed("R2 region: auto");
    }
  }

  const storage: StorageConfig = {
    provider,
    bucket: storageAnswers.bucket,
    accessKeyId: storageAnswers.accessKeyId,
    secretAccessKey: storageAnswers.secretAccessKey,
    ...(storageAnswers.accountId && { accountId: storageAnswers.accountId }),
    ...(storageAnswers.region && { region: storageAnswers.region }),
    ...(storageAnswers.endpoint && { endpoint: storageAnswers.endpoint }),
    ...(r2Jurisdiction && { jurisdiction: r2Jurisdiction }),
  };

  // ── Step 4: Encryption passphrase ────────────────────────────────────────

  log.blank();
  log.info(chalk.dim("[4/5]") + " Encryption passphrase");
  log.blank();
  log.info(chalk.dim("This passphrase encrypts ALL your backups."));
  log.info(chalk.dim("If you lose it, your backups are unrecoverable."));
  log.blank();

  const { passphrase } = await prompts({
    type: "password",
    name: "passphrase",
    message: "Passphrase:",
    validate: (v: string) =>
      v.length >= 8 || "Must be at least 8 characters",
  });

  const { passphraseConfirm } = await prompts({
    type: "password",
    name: "passphraseConfirm",
    message: "Confirm passphrase:",
    validate: (v: string) => v === passphrase || "Passphrases do not match",
  });

  if (!passphrase || !passphraseConfirm) {
    log.info("Setup cancelled.");
    return;
  }

  // Save passphrase (keychain if available, otherwise local file)
  const { isKeychainAvailable, setPassphrase: saveToKeychain } = await import("../core/keychain.js");
  const keychainOk = await isKeychainAvailable();

  const saved = await saveToKeychain(passphrase);
  if (saved && keychainOk) {
    log.success("Passphrase saved to system keychain");
  } else if (saved) {
    log.success("Passphrase saved to ~/.clawstash/passphrase");
  } else {
    log.warn("Could not save passphrase. Set CLAWSTASH_PASSPHRASE env var to avoid prompts.");
  }

  // ── Step 5: Schedule ─────────────────────────────────────────────────────

  log.blank();
  log.info(chalk.dim("[5/5]") + " Backup schedule");
  log.blank();

  const { interval } = await prompts({
    type: "select",
    name: "interval",
    message: "How often should backups run?",
    choices: [
      { title: "Every hour", description: "Recommended", value: 60 },
      { title: "Every 30 minutes", value: 30 },
      { title: "Every 6 hours", value: 360 },
      { title: "Daily", value: 1440 },
      { title: "Manual only", description: "No automatic backups", value: 0 },
    ],
  });

  // ── Install restic ───────────────────────────────────────────────────────

  log.blank();
  const spinner = ora("Installing restic...").start();

  try {
    await ensureRestic(CURRENT_RESTIC_VERSION);
    spinner.succeed("restic installed");
  } catch (err) {
    spinner.fail("Failed to install restic");
    log.error(String(err));
    process.exit(1);
  }

  // ── Create bucket & init repo ────────────────────────────────────────────

  const repoOpts = { storage, passphrase };

  const bucketSpinner = ora("Creating storage bucket...").start();
  try {
    await ensureBucket(storage);
    bucketSpinner.succeed(`Bucket "${storage.bucket}" ready`);
  } catch (err) {
    bucketSpinner.fail(`Failed to create bucket "${storage.bucket}"`);
    log.error(String(err));
    log.info("Check your credentials and permissions.");
    process.exit(1);
  }

  const connSpinner = ora("Initializing backup repository...").start();

  const repoExists = await checkRepo(repoOpts);
  if (repoExists) {
    connSpinner.succeed("Connected to existing repository");
  } else {
    try {
      await initRepo(repoOpts);
      connSpinner.succeed("Repository initialized");
    } catch (err) {
      connSpinner.fail("Failed to initialize repository");
      log.error(String(err));
      log.info("Check your credentials and bucket name.");
      process.exit(1);
    }
  }

  // ── Save config ──────────────────────────────────────────────────────────

  const config: ClawstashConfig = {
    version: 1,
    openclawDir: scan.dir,
    storage,
    retention: DEFAULT_RETENTION,
    daemon: {
      ...DEFAULT_DAEMON,
      enabled: interval > 0,
      intervalMinutes: interval || 60,
    },
    exclude: [],
    resticVersion: CURRENT_RESTIC_VERSION,
  };

  await saveConfig(config);
  log.success("Config saved");

  // ── Note about passphrase ────────────────────────────────────────────────

  log.blank();
  if (saved) {
    if (keychainOk) {
      log.info(chalk.dim("Passphrase is stored in your system keychain. Backups will run without prompts."));
    } else {
      log.info(chalk.dim("Passphrase is stored in ~/.clawstash/passphrase. Backups will run without prompts."));
    }
  } else {
    log.info(chalk.yellow("Important: store your passphrase safely!"));
    log.info(chalk.dim("Set CLAWSTASH_PASSPHRASE env var, or pass --passphrase to each command."));
  }
  log.blank();

  // ── First backup ─────────────────────────────────────────────────────────

  const { runNow } = await prompts({
    type: "confirm",
    name: "runNow",
    message: "Run first backup now?",
    initial: true,
  });

  if (runNow) {
    log.blank();
    // Import dynamically to avoid circular dependency
    const { backupCommand } = await import("./backup.js");
    await backupCommand({ passphrase });
  }

  // ── Install daemon ────────────────────────────────────────────────────────

  if (interval > 0) {
    log.blank();
    const { installDaemon } = await prompts({
      type: "confirm",
      name: "installDaemon",
      message: `Install background service? (backs up every ${interval} min)`,
      initial: true,
    });

    if (installDaemon) {
      try {
        const { daemonInstall } = await import("./daemon.js");
        await daemonInstall();
        log.success("Background service installed");
      } catch (err) {
        log.warn("Could not install background service.");
        log.info(chalk.dim(`Run manually later: clawstash daemon install`));
        log.debug(String(err));
      }
    }
  }

  log.blank();
  log.success("Setup complete!");
  if (interval > 0) {
    log.info(chalk.dim("Your data is safe. Backups run automatically."));
  } else {
    log.info(chalk.dim("Run `clawstash backup` when you want to back up."));
  }
  log.blank();
}
