import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getResticBinaryPath } from "../utils/platform.js";
import type { StorageConfig } from "./config.js";
import { getResticRepoUrl, getStorageEndpoint } from "./config.js";
import { log } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

// ─── Restic JSON output types ───────────────────────────────────────────────

export interface ResticSnapshot {
  id: string;
  short_id: string;
  time: string;
  hostname: string;
  tags: string[] | null;
  paths: string[];
  summary?: {
    files_new: number;
    files_changed: number;
    files_unmodified: number;
    dirs_new: number;
    dirs_changed: number;
    dirs_unmodified: number;
    data_blobs: number;
    tree_blobs: number;
    data_added: number;
    total_files_processed: number;
    total_bytes_processed: number;
    total_duration: number;
  };
}

export interface ResticBackupSummary {
  message_type: "summary";
  files_new: number;
  files_changed: number;
  files_unmodified: number;
  dirs_new: number;
  dirs_changed: number;
  dirs_unmodified: number;
  data_blobs: number;
  tree_blobs: number;
  data_added: number;
  total_files_processed: number;
  total_bytes_processed: number;
  total_duration: number;
  snapshot_id: string;
}

export interface ResticStats {
  total_size: number;
  total_file_count: number;
  snapshots_count?: number;
}

// ─── Restic runner ──────────────────────────────────────────────────────────

export interface ResticOptions {
  storage: StorageConfig;
  passphrase: string;
}

/**
 * Build environment variables for restic S3 backend.
 */
function buildEnv(opts: ResticOptions): NodeJS.ProcessEnv {
  return {
    ...process.env,
    RESTIC_REPOSITORY: getResticRepoUrl(opts.storage),
    RESTIC_PASSWORD: opts.passphrase,
    AWS_ACCESS_KEY_ID: opts.storage.accessKeyId,
    AWS_SECRET_ACCESS_KEY: opts.storage.secretAccessKey,
    AWS_DEFAULT_REGION: opts.storage.region ?? "auto",
  };
}

/**
 * Build extra restic CLI args for S3-compatible backends.
 * Non-AWS backends (R2, MinIO, B2) need path-style bucket addressing.
 */
function buildExtraArgs(storage: StorageConfig): string[] {
  if (storage.provider !== "s3") {
    return ["-o", "s3.bucket-lookup=path"];
  }
  return [];
}

/**
 * Run a restic command and return parsed JSON output.
 */
async function runRestic<T>(
  args: string[],
  opts: ResticOptions,
  options?: { timeout?: number },
): Promise<T> {
  const binaryPath = getResticBinaryPath();
  const env = buildEnv(opts);
  const fullArgs = [...buildExtraArgs(opts.storage), ...args];

  log.debug(`restic ${fullArgs.join(" ")}`);

  const { stdout, stderr } = await execFileAsync(binaryPath, fullArgs, {
    env,
    timeout: options?.timeout ?? 300_000, // 5 min default
    maxBuffer: 50 * 1024 * 1024, // 50MB
  });

  if (stderr) {
    log.debug(`restic stderr: ${stderr}`);
  }

  try {
    return JSON.parse(stdout) as T;
  } catch {
    // Some commands don't return JSON
    return stdout as unknown as T;
  }
}

/**
 * Run a restic command and return raw stdout.
 */
async function runResticRaw(
  args: string[],
  opts: ResticOptions,
  options?: { timeout?: number },
): Promise<string> {
  const binaryPath = getResticBinaryPath();
  const env = buildEnv(opts);
  const fullArgs = [...buildExtraArgs(opts.storage), ...args];

  log.debug(`restic ${fullArgs.join(" ")}`);

  const { stdout, stderr } = await execFileAsync(binaryPath, fullArgs, {
    env,
    timeout: options?.timeout ?? 300_000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (stderr) {
    log.debug(`restic stderr: ${stderr}`);
  }

  return stdout;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize a new restic repository on the remote storage.
 */
export async function initRepo(opts: ResticOptions): Promise<void> {
  await runResticRaw(["init", "--json"], opts);
}

/**
 * Check if the repository already exists and is accessible.
 */
export async function checkRepo(opts: ResticOptions): Promise<boolean> {
  try {
    await runResticRaw(["cat", "config", "--json"], opts, { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a backup of the given source directory.
 */
export async function backup(
  sourceDir: string,
  opts: ResticOptions,
  options?: {
    tags?: string[];
    excludes?: string[];
    includes?: string[];
    dryRun?: boolean;
  },
): Promise<ResticBackupSummary> {
  const args = ["backup", sourceDir, "--json"];

  if (options?.tags) {
    for (const tag of options.tags) {
      args.push("--tag", tag);
    }
  }

  if (options?.excludes) {
    for (const pattern of options.excludes) {
      args.push("--exclude", pattern);
    }
  }

  if (options?.includes) {
    // Use --files-from-verbatim or --include patterns
    // restic backup uses --iexclude/--exclude but for selective inclusion
    // we need to combine source dir with specific file patterns via --include
    for (const pattern of options.includes) {
      args.push("--include", pattern);
    }
  }

  if (options?.dryRun) {
    args.push("--dry-run");
  }

  const output = await runResticRaw(args, opts, { timeout: 600_000 });

  // Restic outputs multiple JSON lines, we want the summary (last line)
  const lines = output.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.message_type === "summary") {
        return parsed as ResticBackupSummary;
      }
    } catch {
      continue;
    }
  }

  throw new Error("No backup summary found in restic output");
}

/**
 * List all snapshots.
 */
export async function listSnapshots(
  opts: ResticOptions,
  options?: { tags?: string[] },
): Promise<ResticSnapshot[]> {
  const args = ["snapshots", "--json"];

  if (options?.tags) {
    for (const tag of options.tags) {
      args.push("--tag", tag);
    }
  }

  const result = await runRestic<ResticSnapshot[] | null>(args, opts);
  return result ?? [];
}

/**
 * Restore a snapshot to a target directory.
 */
export async function restore(
  snapshotId: string,
  targetDir: string,
  opts: ResticOptions,
  options?: {
    include?: string[];
    exclude?: string[];
  },
): Promise<void> {
  const args = ["restore", snapshotId, "--target", targetDir];

  if (options?.include) {
    for (const pattern of options.include) {
      args.push("--include", pattern);
    }
  }

  if (options?.exclude) {
    for (const pattern of options.exclude) {
      args.push("--exclude", pattern);
    }
  }

  await runResticRaw(args, opts, { timeout: 600_000 });
}

/**
 * Apply retention policy and prune old snapshots.
 */
export async function forget(
  opts: ResticOptions,
  retention: {
    keepLast?: number;
    keepDaily?: number;
    keepWeekly?: number;
    keepMonthly?: number;
  },
): Promise<void> {
  const args = ["forget", "--prune", "--json"];

  if (retention.keepLast) args.push("--keep-last", String(retention.keepLast));
  if (retention.keepDaily) args.push("--keep-daily", String(retention.keepDaily));
  if (retention.keepWeekly) args.push("--keep-weekly", String(retention.keepWeekly));
  if (retention.keepMonthly) args.push("--keep-monthly", String(retention.keepMonthly));

  await runResticRaw(args, opts, { timeout: 600_000 });
}

/**
 * Get repository stats (size, file count).
 */
export async function stats(opts: ResticOptions): Promise<ResticStats> {
  return runRestic<ResticStats>(["stats", "--json", "--mode", "raw-data"], opts);
}

/**
 * Check repository integrity.
 */
export async function check(opts: ResticOptions): Promise<boolean> {
  try {
    await runResticRaw(["check"], opts, { timeout: 300_000 });
    return true;
  } catch {
    return false;
  }
}
