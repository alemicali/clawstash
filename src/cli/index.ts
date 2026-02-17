import { createRequire } from "node:module";
import { Command } from "commander";
import { setLogLevel } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("clawstash")
  .description("Encrypted backups for OpenClaw")
  .version(version)
  .option("--verbose", "Enable debug logging")
  .hook("preAction", (cmd) => {
    const opts = cmd.optsWithGlobals();
    if (opts.verbose) setLogLevel("debug");
  });

program
  .command("setup")
  .description("Configure clawstash (storage, encryption, schedule)")
  .action(async () => {
    const { setupCommand } = await import("./setup.js");
    await setupCommand();
  });

program
  .command("backup")
  .description("Run an incremental backup")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .option("--only <category>", "Backup only: config, secrets, workspace, sessions, memory")
  .option("--dry-run", "Show what would be backed up without uploading")
  .option("--no-forget", "Skip automatic retention cleanup")
  .action(async (opts) => {
    const { backupCommand } = await import("./backup.js");
    await backupCommand(opts);
  });

program
  .command("restore")
  .description("Restore from a backup snapshot")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .option("--only <category>", "Restore only: config, secrets, workspace, sessions, memory")
  .option("--at <time>", 'Point-in-time restore (ISO date or "3 days ago")')
  .option("--target <path>", "Restore to a custom directory")
  .option("--dry-run", "Show what would be restored")
  .action(async (opts) => {
    const { restoreCommand } = await import("./restore.js");
    await restoreCommand(opts);
  });

program
  .command("snapshots")
  .description("List all backup snapshots")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .action(async (opts) => {
    const { snapshotsCommand } = await import("./snapshots.js");
    await snapshotsCommand(opts);
  });

program
  .command("status")
  .description("Show backup status and health")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .action(async (opts) => {
    const { statusCommand } = await import("./status.js");
    await statusCommand(opts);
  });

program
  .command("forget")
  .description("Apply retention policy and prune old snapshots")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .action(async (opts) => {
    const { forgetCommand } = await import("./forget.js");
    await forgetCommand(opts);
  });

program
  .command("doctor")
  .description("Run diagnostic checks")
  .option("-p, --passphrase <passphrase>", "Encryption passphrase")
  .action(async (opts) => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand(opts);
  });

const daemonCmd = program
  .command("daemon")
  .description("Manage background backup service");

daemonCmd
  .command("install")
  .description("Install background backup service (launchd/systemd)")
  .action(async () => {
    const { daemonInstall } = await import("./daemon.js");
    await daemonInstall();
  });

daemonCmd
  .command("uninstall")
  .description("Remove background backup service")
  .action(async () => {
    const { daemonUninstall } = await import("./daemon.js");
    await daemonUninstall();
  });

daemonCmd
  .command("status")
  .description("Check background service status")
  .action(async () => {
    const { daemonStatus } = await import("./daemon.js");
    await daemonStatus();
  });

program.parse();
