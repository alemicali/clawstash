import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getDefaultOpenClawDir } from "../utils/platform.js";
import { pathExists, formatBytes } from "../utils/fs.js";

export interface OpenClawFile {
  path: string;
  relativePath: string;
  size: number;
  category: FileCategory;
}

export type FileCategory =
  | "config"
  | "secrets"
  | "workspace"
  | "sessions"
  | "memory"
  | "skills"
  | "agents"
  | "settings"
  | "other";

export interface OpenClawScanResult {
  dir: string;
  exists: boolean;
  files: OpenClawFile[];
  totalSize: number;
  categories: Record<FileCategory, { count: number; size: number }>;
}

/**
 * Default exclude patterns for restic backup.
 * These are files that should never be backed up.
 */
export const DEFAULT_EXCLUDES = [
  // Lock files
  "*.lock",
  "gateway.lock",
  // Temp files
  "*.tmp",
  "*.temp",
  // SQLite WAL/SHM (restic handles the main DB file atomically)
  "*-wal",
  "*-shm",
  // Node modules (if present in workspace)
  "node_modules",
  // OS junk
  ".DS_Store",
  "Thumbs.db",
  // Log files
  "*.log",
  // Cache directories
  "cache/",
  ".cache/",
  // Sandbox ephemeral workspaces (auto-pruned by OpenClaw)
  "sandboxes/",
  // QMD downloaded model cache (re-downloadable, can be large)
  "*/qmd/xdg-cache/",
];

/**
 * Categorize a file path within ~/.openclaw/.
 */
export function categorizeFile(relativePath: string): FileCategory {
  // Config files at root
  if (
    relativePath === "openclaw.json" ||
    relativePath === "openclaw.json5" ||
    relativePath.startsWith("openclaw.") && !relativePath.includes("/")
  ) {
    return "config";
  }

  // Environment and secrets
  if (
    relativePath === ".env" ||
    relativePath.startsWith("credentials/") ||
    relativePath.startsWith("auth/")
  ) {
    return "secrets";
  }

  // Workspace (prompts, identity, memory logs, canvas)
  if (relativePath.startsWith("workspace/") || relativePath.startsWith("workspace-")) {
    return "workspace";
  }

  // Managed/local skills
  if (relativePath.startsWith("skills/")) {
    return "skills";
  }

  // Session transcripts
  if (relativePath.includes("/sessions/") && (relativePath.endsWith(".jsonl") || relativePath.endsWith("sessions.json"))) {
    return "sessions";
  }

  // Memory databases
  if (relativePath.endsWith(".sqlite") && (relativePath.startsWith("memory/") || relativePath.includes("memory"))) {
    return "memory";
  }

  // Per-agent config (models.json, etc.)
  if (relativePath.match(/^agents\/[^/]+\/agent\//)) {
    return "agents";
  }

  // Settings (TTS prefs, etc.)
  if (relativePath.startsWith("settings/")) {
    return "settings";
  }

  return "other";
}

/**
 * Recursively scan a directory and collect all files.
 */
async function scanDir(
  baseDir: string,
  currentDir: string,
  files: OpenClawFile[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    const relativePath = fullPath.slice(baseDir.length + 1);

    if (entry.isDirectory()) {
      // Skip node_modules and cache
      if (entry.name === "node_modules" || entry.name === ".cache" || entry.name === "cache") {
        continue;
      }
      await scanDir(baseDir, fullPath, files);
    } else if (entry.isFile()) {
      const info = await stat(fullPath);
      files.push({
        path: fullPath,
        relativePath,
        size: info.size,
        category: categorizeFile(relativePath),
      });
    }
  }
}

/**
 * Detect and scan the OpenClaw data directory.
 */
export async function scanOpenClawDir(
  openclawDir?: string,
): Promise<OpenClawScanResult> {
  const dir = openclawDir ?? getDefaultOpenClawDir();
  const exists = await pathExists(dir);

  const emptyCategories: Record<FileCategory, { count: number; size: number }> = {
    config: { count: 0, size: 0 },
    secrets: { count: 0, size: 0 },
    workspace: { count: 0, size: 0 },
    sessions: { count: 0, size: 0 },
    memory: { count: 0, size: 0 },
    skills: { count: 0, size: 0 },
    agents: { count: 0, size: 0 },
    settings: { count: 0, size: 0 },
    other: { count: 0, size: 0 },
  };

  if (!exists) {
    return { dir, exists, files: [], totalSize: 0, categories: emptyCategories };
  }

  const files: OpenClawFile[] = [];
  await scanDir(dir, dir, files);

  const categories = { ...emptyCategories };
  let totalSize = 0;

  for (const file of files) {
    categories[file.category].count++;
    categories[file.category].size += file.size;
    totalSize += file.size;
  }

  return { dir, exists, files, totalSize, categories };
}

/**
 * Format scan result for display.
 */
export function formatScanResult(scan: OpenClawScanResult): string {
  const lines: string[] = [];

  lines.push(`OpenClaw directory: ${scan.dir}`);
  lines.push(`Total: ${scan.files.length} files (${formatBytes(scan.totalSize)})`);
  lines.push("");

  const categoryLabels: Record<FileCategory, string> = {
    config: "Config",
    secrets: "Secrets/Credentials",
    workspace: "Workspace",
    sessions: "Sessions",
    memory: "Memory DB",
    skills: "Skills",
    agents: "Agent Config",
    settings: "Settings",
    other: "Other",
  };

  for (const [cat, label] of Object.entries(categoryLabels)) {
    const data = scan.categories[cat as FileCategory];
    if (data.count > 0) {
      lines.push(`  ${label.padEnd(22)} ${String(data.count).padStart(5)} files  ${formatBytes(data.size).padStart(10)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Check if OpenClaw gateway is currently running.
 * Tries to connect to the default WebSocket port.
 */
export async function isOpenClawRunning(port = 18789): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
