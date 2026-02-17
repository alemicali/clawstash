import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  scanOpenClawDir,
  formatScanResult,
  DEFAULT_EXCLUDES,
  isOpenClawRunning,
} from "../src/core/openclaw.js";

let tempDir: string;

describe("scanOpenClawDir", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "clawstash-scan-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns exists=false for non-existent directory", async () => {
    const result = await scanOpenClawDir("/nonexistent/path/to/openclaw");
    expect(result.exists).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.totalSize).toBe(0);
  });

  it("scans empty directory", async () => {
    const result = await scanOpenClawDir(tempDir);
    expect(result.exists).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.totalSize).toBe(0);
    expect(result.dir).toBe(tempDir);
  });

  it("scans directory with files and categorizes them", async () => {
    // Create mock OpenClaw structure
    await writeFile(join(tempDir, "openclaw.json"), '{"version":1}');
    await writeFile(join(tempDir, ".env"), "API_KEY=test");
    await mkdir(join(tempDir, "credentials"), { recursive: true });
    await writeFile(join(tempDir, "credentials", "auth.json"), "{}");
    await mkdir(join(tempDir, "workspace"), { recursive: true });
    await writeFile(join(tempDir, "workspace", "IDENTITY.md"), "# Identity");
    await mkdir(join(tempDir, "settings"), { recursive: true });
    await writeFile(join(tempDir, "settings", "tts.json"), "{}");

    const result = await scanOpenClawDir(tempDir);

    expect(result.exists).toBe(true);
    expect(result.files.length).toBe(5);
    expect(result.totalSize).toBeGreaterThan(0);

    // Check categories
    expect(result.categories.config.count).toBe(1);
    expect(result.categories.secrets.count).toBe(2); // .env + credentials/auth.json
    expect(result.categories.workspace.count).toBe(1);
    expect(result.categories.settings.count).toBe(1);
  });

  it("scans session transcripts", async () => {
    await mkdir(join(tempDir, "agents", "main", "sessions"), { recursive: true });
    await writeFile(join(tempDir, "agents", "main", "sessions", "abc.jsonl"), '{"role":"user"}');
    await writeFile(join(tempDir, "agents", "main", "sessions", "sessions.json"), "{}");

    const result = await scanOpenClawDir(tempDir);

    expect(result.categories.sessions.count).toBe(2);
  });

  it("scans memory databases", async () => {
    await mkdir(join(tempDir, "memory"), { recursive: true });
    await writeFile(join(tempDir, "memory", "main.sqlite"), "SQLite");

    const result = await scanOpenClawDir(tempDir);
    expect(result.categories.memory.count).toBe(1);
  });

  it("scans agent config", async () => {
    await mkdir(join(tempDir, "agents", "main", "agent"), { recursive: true });
    await writeFile(join(tempDir, "agents", "main", "agent", "models.json"), "{}");

    const result = await scanOpenClawDir(tempDir);
    expect(result.categories.agents.count).toBe(1);
  });

  it("scans skills", async () => {
    await mkdir(join(tempDir, "skills", "web-search"), { recursive: true });
    await writeFile(join(tempDir, "skills", "web-search", "SKILL.md"), "# Skill");

    const result = await scanOpenClawDir(tempDir);
    expect(result.categories.skills.count).toBe(1);
  });

  it("skips node_modules directories", async () => {
    await mkdir(join(tempDir, "node_modules", "some-pkg"), { recursive: true });
    await writeFile(join(tempDir, "node_modules", "some-pkg", "index.js"), "");
    await writeFile(join(tempDir, "openclaw.json"), "{}");

    const result = await scanOpenClawDir(tempDir);

    // Should only find openclaw.json, not anything in node_modules
    expect(result.files.length).toBe(1);
    expect(result.files[0].relativePath).toBe("openclaw.json");
  });

  it("skips cache directories", async () => {
    await mkdir(join(tempDir, ".cache"), { recursive: true });
    await writeFile(join(tempDir, ".cache", "data.bin"), "cached");
    await mkdir(join(tempDir, "cache"), { recursive: true });
    await writeFile(join(tempDir, "cache", "data.bin"), "cached");
    await writeFile(join(tempDir, "openclaw.json"), "{}");

    const result = await scanOpenClawDir(tempDir);
    expect(result.files.length).toBe(1);
  });

  it("calculates total size correctly", async () => {
    const content = "Hello, World!"; // 13 bytes
    await writeFile(join(tempDir, "openclaw.json"), content);
    await writeFile(join(tempDir, ".env"), content);

    const result = await scanOpenClawDir(tempDir);
    expect(result.totalSize).toBe(26); // 2 * 13
  });

  it("handles multi-agent workspace directories", async () => {
    await mkdir(join(tempDir, "workspace-home"), { recursive: true });
    await writeFile(join(tempDir, "workspace-home", "AGENTS.md"), "# Agents");

    const result = await scanOpenClawDir(tempDir);
    expect(result.categories.workspace.count).toBe(1);
  });
});

describe("formatScanResult", () => {
  it("formats scan result for display", async () => {
    const tempDir2 = await mkdtemp(join(tmpdir(), "clawstash-fmt-"));
    try {
      await writeFile(join(tempDir2, "openclaw.json"), '{"v":1}');
      await writeFile(join(tempDir2, ".env"), "KEY=val");

      const scan = await scanOpenClawDir(tempDir2);
      const output = formatScanResult(scan);

      expect(output).toContain("OpenClaw directory:");
      expect(output).toContain("Total:");
      expect(output).toContain("files");
    } finally {
      await rm(tempDir2, { recursive: true, force: true });
    }
  });

  it("formats empty scan result", () => {
    const result = formatScanResult({
      dir: "/home/user/.openclaw",
      exists: true,
      files: [],
      totalSize: 0,
      categories: {
        config: { count: 0, size: 0 },
        secrets: { count: 0, size: 0 },
        workspace: { count: 0, size: 0 },
        sessions: { count: 0, size: 0 },
        memory: { count: 0, size: 0 },
        skills: { count: 0, size: 0 },
        agents: { count: 0, size: 0 },
        settings: { count: 0, size: 0 },
        other: { count: 0, size: 0 },
      },
    });
    expect(result).toContain("0 files");
    expect(result).toContain("0 B");
  });
});

describe("DEFAULT_EXCLUDES", () => {
  it("contains lock files", () => {
    expect(DEFAULT_EXCLUDES).toContain("*.lock");
    expect(DEFAULT_EXCLUDES).toContain("gateway.lock");
  });

  it("contains SQLite WAL/SHM", () => {
    expect(DEFAULT_EXCLUDES).toContain("*-wal");
    expect(DEFAULT_EXCLUDES).toContain("*-shm");
  });

  it("contains temp files", () => {
    expect(DEFAULT_EXCLUDES).toContain("*.tmp");
    expect(DEFAULT_EXCLUDES).toContain("*.temp");
  });

  it("contains OS junk", () => {
    expect(DEFAULT_EXCLUDES).toContain(".DS_Store");
    expect(DEFAULT_EXCLUDES).toContain("Thumbs.db");
  });

  it("contains node_modules", () => {
    expect(DEFAULT_EXCLUDES).toContain("node_modules");
  });

  it("contains sandboxes", () => {
    expect(DEFAULT_EXCLUDES).toContain("sandboxes/");
  });

  it("contains qmd model cache", () => {
    expect(DEFAULT_EXCLUDES).toContain("*/qmd/xdg-cache/");
  });

  it("contains cache directories", () => {
    expect(DEFAULT_EXCLUDES).toContain("cache/");
    expect(DEFAULT_EXCLUDES).toContain(".cache/");
  });

  it("contains log files", () => {
    expect(DEFAULT_EXCLUDES).toContain("*.log");
  });
});

describe("isOpenClawRunning", () => {
  it("returns false when gateway is not running on a random port", async () => {
    // Use a high random port that is almost certainly not in use
    const result = await isOpenClawRunning(59871);
    expect(result).toBe(false);
  });

  it("returns false on invalid port", async () => {
    const result = await isOpenClawRunning(1);
    expect(result).toBe(false);
  });
});
