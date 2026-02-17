import chalk from "chalk";
import { log } from "../utils/logger.js";
import { runHealthChecks, type HealthCheck } from "../core/health.js";

export interface DoctorOptions {
  passphrase?: string;
}

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  const passphrase = opts.passphrase ?? process.env.CLAWSTASH_PASSPHRASE;

  log.header("clawstash doctor");

  const checks = await runHealthChecks(passphrase);

  for (const check of checks) {
    const icon = statusIcon(check.status);
    const label = check.name.padEnd(22);
    const message = statusColor(check.status, check.message);
    log.raw(`  ${icon} ${label}${message}`);
  }

  log.blank();

  const errors = checks.filter((c) => c.status === "error");
  const warnings = checks.filter((c) => c.status === "warn");

  if (errors.length === 0 && warnings.length === 0) {
    log.success("No issues found.");
  } else {
    if (errors.length > 0) {
      log.error(`${errors.length} error${errors.length > 1 ? "s" : ""} found.`);
    }
    if (warnings.length > 0) {
      log.warn(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}.`);
    }
  }
}

function statusIcon(status: HealthCheck["status"]): string {
  switch (status) {
    case "ok":
      return chalk.green("OK");
    case "warn":
      return chalk.yellow("!!");
    case "error":
      return chalk.red("XX");
  }
}

function statusColor(status: HealthCheck["status"], message: string): string {
  switch (status) {
    case "ok":
      return chalk.green(message);
    case "warn":
      return chalk.yellow(message);
    case "error":
      return chalk.red(message);
  }
}
