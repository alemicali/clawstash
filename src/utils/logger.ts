import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

let currentLevel: LogLevel = "info";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel];
}

export const log = {
  debug(msg: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.error(chalk.gray(`  [debug] ${msg}`), ...args);
    }
  },

  info(msg: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.error(chalk.white(`  ${msg}`), ...args);
    }
  },

  success(msg: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.error(chalk.green(`  ${msg}`), ...args);
    }
  },

  warn(msg: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.error(chalk.yellow(`  [warn] ${msg}`), ...args);
    }
  },

  error(msg: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(chalk.red(`  [error] ${msg}`), ...args);
    }
  },

  /** Print without any prefix, used for formatted output */
  raw(msg: string): void {
    console.log(msg);
  },

  /** Blank line */
  blank(): void {
    console.error("");
  },

  /** Section header */
  header(msg: string): void {
    console.error(chalk.bold.white(`\n  ${msg}\n`));
  },

  /** Key-value pair for status output */
  kv(key: string, value: string, status?: "ok" | "warn" | "error"): void {
    const label = chalk.gray(`  ${key.padEnd(20)}`);
    const colorFn =
      status === "ok"
        ? chalk.green
        : status === "warn"
          ? chalk.yellow
          : status === "error"
            ? chalk.red
            : chalk.white;
    console.error(`${label}${colorFn(value)}`);
  },
};
