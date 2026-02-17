import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// We need a temp config path for each test
let tempDir: string;
let configPath: string;

vi.mock("../src/utils/platform.js", () => ({
  getClawstashConfigPath: () => configPath,
}));

import {
  loadConfig,
  saveConfig,
  requireConfig,
  DEFAULT_RETENTION,
  DEFAULT_DAEMON,
  CURRENT_RESTIC_VERSION,
  type ClawstashConfig,
} from "../src/core/config.js";

function makeConfig(overrides?: Partial<ClawstashConfig>): ClawstashConfig {
  return {
    version: 1,
    openclawDir: "/home/user/.openclaw",
    storage: {
      provider: "r2",
      bucket: "test-bucket",
      accountId: "abc123",
      accessKeyId: "AKID",
      secretAccessKey: "SECRET",
    },
    retention: { ...DEFAULT_RETENTION },
    daemon: { ...DEFAULT_DAEMON },
    exclude: [],
    resticVersion: CURRENT_RESTIC_VERSION,
    ...overrides,
  };
}

describe("config I/O", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "clawstash-test-"));
    configPath = join(tempDir, "config.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loadConfig returns null when no config exists", async () => {
    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it("saveConfig + loadConfig round-trip", async () => {
    const config = makeConfig();
    await saveConfig(config);

    const loaded = await loadConfig();
    expect(loaded).toEqual(config);
  });

  it("saves with pretty-printed JSON", async () => {
    const config = makeConfig();
    await saveConfig(config);

    const raw = await readFile(configPath, "utf-8");
    // Should have indentation (not a single line)
    expect(raw.split("\n").length).toBeGreaterThan(5);
    // Should end with newline
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("preserves all fields through save/load cycle", async () => {
    const config = makeConfig({
      exclude: ["*.tmp", "node_modules"],
      daemon: { enabled: true, intervalMinutes: 30, quietMinutes: 10 },
      retention: { keepLast: 14, keepDaily: 60, keepWeekly: 24, keepMonthly: 12 },
    });

    await saveConfig(config);
    const loaded = await loadConfig();

    expect(loaded?.exclude).toEqual(["*.tmp", "node_modules"]);
    expect(loaded?.daemon.enabled).toBe(true);
    expect(loaded?.daemon.intervalMinutes).toBe(30);
    expect(loaded?.retention.keepLast).toBe(14);
    expect(loaded?.retention.keepMonthly).toBe(12);
  });

  it("saves config with different providers", async () => {
    for (const provider of ["r2", "s3", "b2", "minio"] as const) {
      configPath = join(tempDir, `config-${provider}.json`);
      const config = makeConfig({
        storage: {
          provider,
          bucket: `${provider}-bucket`,
          accessKeyId: "key",
          secretAccessKey: "secret",
          ...(provider === "r2" ? { accountId: "acc" } : {}),
          ...(provider === "minio" ? { endpoint: "https://minio.local:9000" } : {}),
          ...(provider === "s3" ? { region: "eu-west-1" } : {}),
        },
      });
      await saveConfig(config);
      const loaded = await loadConfig();
      expect(loaded?.storage.provider).toBe(provider);
    }
  });

  describe("requireConfig", () => {
    it("throws when no config exists", async () => {
      await expect(requireConfig()).rejects.toThrow(
        "No clawstash config found",
      );
    });

    it("returns config when it exists", async () => {
      const config = makeConfig();
      await saveConfig(config);

      const result = await requireConfig();
      expect(result).toEqual(config);
    });
  });

  describe("defaults", () => {
    it("DEFAULT_RETENTION has expected values", () => {
      expect(DEFAULT_RETENTION.keepLast).toBe(7);
      expect(DEFAULT_RETENTION.keepDaily).toBe(30);
      expect(DEFAULT_RETENTION.keepWeekly).toBe(12);
      expect(DEFAULT_RETENTION.keepMonthly).toBe(6);
    });

    it("DEFAULT_DAEMON has expected values", () => {
      expect(DEFAULT_DAEMON.enabled).toBe(false);
      expect(DEFAULT_DAEMON.intervalMinutes).toBe(60);
      expect(DEFAULT_DAEMON.quietMinutes).toBe(5);
    });

    it("CURRENT_RESTIC_VERSION is a semver string", () => {
      expect(CURRENT_RESTIC_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
