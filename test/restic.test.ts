import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process
const mockExecFileAsync = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:util")>();
  return {
    ...actual,
    promisify: () => mockExecFileAsync,
  };
});

vi.mock("../src/utils/platform.js", () => ({
  getResticBinaryPath: () => "/mock/bin/restic",
}));

vi.mock("../src/utils/logger.js", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import type { StorageConfig } from "../src/core/config.js";

const mockStorage: StorageConfig = {
  provider: "r2",
  bucket: "test-bucket",
  accountId: "abc123",
  accessKeyId: "AKID",
  secretAccessKey: "SECRET",
};

const mockOpts = { storage: mockStorage, passphrase: "test-pass" };

describe("restic", () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  describe("initRepo", () => {
    it("calls restic init with correct args", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "created", stderr: "" });

      const { initRepo } = await import("../src/core/restic.js");
      await initRepo(mockOpts);

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        "/mock/bin/restic",
        ["-o", "s3.bucket-lookup=path", "init", "--json"],
        expect.objectContaining({
          env: expect.objectContaining({
            RESTIC_REPOSITORY: "s3:https://abc123.r2.cloudflarestorage.com/test-bucket",
            RESTIC_PASSWORD: "test-pass",
            AWS_ACCESS_KEY_ID: "AKID",
            AWS_SECRET_ACCESS_KEY: "SECRET",
          }),
        }),
      );
    });
  });

  describe("checkRepo", () => {
    it("returns true when repo exists", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "{}", stderr: "" });

      const { checkRepo } = await import("../src/core/restic.js");
      const result = await checkRepo(mockOpts);
      expect(result).toBe(true);
    });

    it("returns false when repo does not exist", async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error("repo not found"));

      const { checkRepo } = await import("../src/core/restic.js");
      const result = await checkRepo(mockOpts);
      expect(result).toBe(false);
    });
  });

  describe("backup", () => {
    it("parses backup summary from multi-line output", async () => {
      const output = [
        '{"message_type":"status","percent_done":0.5}',
        '{"message_type":"status","percent_done":1.0}',
        '{"message_type":"summary","files_new":10,"files_changed":2,"files_unmodified":100,"dirs_new":1,"dirs_changed":0,"dirs_unmodified":20,"data_blobs":5,"tree_blobs":3,"data_added":1024,"total_files_processed":112,"total_bytes_processed":50000,"total_duration":1.5,"snapshot_id":"abc12345"}',
      ].join("\n");

      mockExecFileAsync.mockResolvedValueOnce({ stdout: output, stderr: "" });

      const { backup } = await import("../src/core/restic.js");
      const summary = await backup("/home/user/.openclaw", mockOpts);

      expect(summary.message_type).toBe("summary");
      expect(summary.files_new).toBe(10);
      expect(summary.files_changed).toBe(2);
      expect(summary.snapshot_id).toBe("abc12345");
      expect(summary.data_added).toBe(1024);
    });

    it("includes tags in restic args", async () => {
      const output = '{"message_type":"summary","files_new":0,"files_changed":0,"files_unmodified":0,"dirs_new":0,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":0,"tree_blobs":0,"data_added":0,"total_files_processed":0,"total_bytes_processed":0,"total_duration":0.1,"snapshot_id":"def456"}';
      mockExecFileAsync.mockResolvedValueOnce({ stdout: output, stderr: "" });

      const { backup } = await import("../src/core/restic.js");
      await backup("/home/user/.openclaw", mockOpts, {
        tags: ["clawstash", "sessions"],
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--tag");
      expect(args).toContain("clawstash");
      expect(args).toContain("sessions");
    });

    it("includes excludes in restic args", async () => {
      const output = '{"message_type":"summary","files_new":0,"files_changed":0,"files_unmodified":0,"dirs_new":0,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":0,"tree_blobs":0,"data_added":0,"total_files_processed":0,"total_bytes_processed":0,"total_duration":0.1,"snapshot_id":"ghi789"}';
      mockExecFileAsync.mockResolvedValueOnce({ stdout: output, stderr: "" });

      const { backup } = await import("../src/core/restic.js");
      await backup("/home/user/.openclaw", mockOpts, {
        excludes: ["*.lock", "node_modules"],
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--exclude");
      expect(args).toContain("*.lock");
      expect(args).toContain("node_modules");
    });

    it("includes include patterns for --only filter", async () => {
      const output = '{"message_type":"summary","files_new":0,"files_changed":0,"files_unmodified":0,"dirs_new":0,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":0,"tree_blobs":0,"data_added":0,"total_files_processed":0,"total_bytes_processed":0,"total_duration":0.1,"snapshot_id":"jkl012"}';
      mockExecFileAsync.mockResolvedValueOnce({ stdout: output, stderr: "" });

      const { backup } = await import("../src/core/restic.js");
      await backup("/home/user/.openclaw", mockOpts, {
        includes: ["credentials/**", "auth/**"],
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--include");
      expect(args).toContain("credentials/**");
      expect(args).toContain("auth/**");
    });

    it("adds --dry-run flag", async () => {
      const output = '{"message_type":"summary","files_new":0,"files_changed":0,"files_unmodified":0,"dirs_new":0,"dirs_changed":0,"dirs_unmodified":0,"data_blobs":0,"tree_blobs":0,"data_added":0,"total_files_processed":0,"total_bytes_processed":0,"total_duration":0.1,"snapshot_id":"mno345"}';
      mockExecFileAsync.mockResolvedValueOnce({ stdout: output, stderr: "" });

      const { backup } = await import("../src/core/restic.js");
      await backup("/home/user/.openclaw", mockOpts, { dryRun: true });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--dry-run");
    });

    it("throws when no summary found", async () => {
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: '{"message_type":"status","percent_done":0.5}\n',
        stderr: "",
      });

      const { backup } = await import("../src/core/restic.js");
      await expect(backup("/home/user/.openclaw", mockOpts)).rejects.toThrow(
        "No backup summary found",
      );
    });
  });

  describe("listSnapshots", () => {
    it("returns parsed snapshots", async () => {
      const snapshots = [
        { id: "abc", short_id: "abc1", time: "2026-02-17T10:00:00Z", hostname: "test", tags: ["clawstash"], paths: ["/home/.openclaw"] },
        { id: "def", short_id: "def2", time: "2026-02-17T11:00:00Z", hostname: "test", tags: null, paths: ["/home/.openclaw"] },
      ];
      mockExecFileAsync.mockResolvedValueOnce({ stdout: JSON.stringify(snapshots), stderr: "" });

      const { listSnapshots } = await import("../src/core/restic.js");
      const result = await listSnapshots(mockOpts);

      expect(result).toHaveLength(2);
      expect(result[0].short_id).toBe("abc1");
      expect(result[1].tags).toBeNull();
    });

    it("returns empty array for null output", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "null", stderr: "" });

      const { listSnapshots } = await import("../src/core/restic.js");
      const result = await listSnapshots(mockOpts);
      expect(result).toEqual([]);
    });

    it("passes tag filters", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "[]", stderr: "" });

      const { listSnapshots } = await import("../src/core/restic.js");
      await listSnapshots(mockOpts, { tags: ["clawstash"] });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--tag");
      expect(args).toContain("clawstash");
    });
  });

  describe("restore", () => {
    it("calls restic restore with snapshot id and target", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { restore } = await import("../src/core/restic.js");
      await restore("abc12345", "/tmp/restore", mockOpts);

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("restore");
      expect(args).toContain("abc12345");
      expect(args).toContain("--target");
      expect(args).toContain("/tmp/restore");
    });

    it("passes include patterns", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { restore } = await import("../src/core/restic.js");
      await restore("abc12345", "/tmp/restore", mockOpts, {
        include: ["**/credentials/**"],
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--include");
      expect(args).toContain("**/credentials/**");
    });

    it("passes exclude patterns", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { restore } = await import("../src/core/restic.js");
      await restore("abc12345", "/tmp/restore", mockOpts, {
        exclude: ["*.log"],
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--exclude");
      expect(args).toContain("*.log");
    });
  });

  describe("forget", () => {
    it("passes retention flags to restic", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { forget } = await import("../src/core/restic.js");
      await forget(mockOpts, {
        keepLast: 7,
        keepDaily: 30,
        keepWeekly: 12,
        keepMonthly: 6,
      });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("forget");
      expect(args).toContain("--prune");
      expect(args).toContain("--keep-last");
      expect(args).toContain("7");
      expect(args).toContain("--keep-daily");
      expect(args).toContain("30");
      expect(args).toContain("--keep-weekly");
      expect(args).toContain("12");
      expect(args).toContain("--keep-monthly");
      expect(args).toContain("6");
    });

    it("omits unset retention values", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });

      const { forget } = await import("../src/core/restic.js");
      await forget(mockOpts, { keepLast: 5 });

      const args = mockExecFileAsync.mock.calls[0][1];
      expect(args).toContain("--keep-last");
      expect(args).not.toContain("--keep-daily");
      expect(args).not.toContain("--keep-weekly");
      expect(args).not.toContain("--keep-monthly");
    });
  });

  describe("stats", () => {
    it("returns parsed repo stats", async () => {
      const repoStats = { total_size: 1048576, total_file_count: 42 };
      mockExecFileAsync.mockResolvedValueOnce({
        stdout: JSON.stringify(repoStats),
        stderr: "",
      });

      const { stats } = await import("../src/core/restic.js");
      const result = await stats(mockOpts);

      expect(result.total_size).toBe(1048576);
      expect(result.total_file_count).toBe(42);
    });
  });

  describe("check", () => {
    it("returns true on successful check", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "no errors", stderr: "" });

      const { check } = await import("../src/core/restic.js");
      const result = await check(mockOpts);
      expect(result).toBe(true);
    });

    it("returns false on check failure", async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error("integrity error"));

      const { check } = await import("../src/core/restic.js");
      const result = await check(mockOpts);
      expect(result).toBe(false);
    });
  });

  describe("buildEnv", () => {
    it("sets correct environment variables for R2", async () => {
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "{}", stderr: "" });

      const { checkRepo } = await import("../src/core/restic.js");
      await checkRepo(mockOpts);

      const envUsed = mockExecFileAsync.mock.calls[0][2].env;
      expect(envUsed.RESTIC_REPOSITORY).toBe(
        "s3:https://abc123.r2.cloudflarestorage.com/test-bucket",
      );
      expect(envUsed.RESTIC_PASSWORD).toBe("test-pass");
      expect(envUsed.AWS_ACCESS_KEY_ID).toBe("AKID");
      expect(envUsed.AWS_SECRET_ACCESS_KEY).toBe("SECRET");
      expect(envUsed.AWS_DEFAULT_REGION).toBe("auto");
    });

    it("sets custom region for S3", async () => {
      const s3Opts = {
        storage: {
          ...mockStorage,
          provider: "s3" as const,
          region: "eu-west-1",
          accountId: undefined,
          endpoint: "https://s3.eu-west-1.amazonaws.com",
        },
        passphrase: "test-pass",
      };
      mockExecFileAsync.mockResolvedValueOnce({ stdout: "{}", stderr: "" });

      const { checkRepo } = await import("../src/core/restic.js");
      await checkRepo(s3Opts);

      const envUsed = mockExecFileAsync.mock.calls[0][2].env;
      expect(envUsed.AWS_DEFAULT_REGION).toBe("eu-west-1");
    });
  });
});
