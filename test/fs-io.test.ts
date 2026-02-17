import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathExists, ensureDir, readJson, writeJson } from "../src/utils/fs.js";

let tempDir: string;

describe("fs utilities (I/O)", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "clawstash-fs-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("pathExists", () => {
    it("returns true for existing file", async () => {
      const file = join(tempDir, "test.txt");
      await writeFile(file, "hello");
      expect(await pathExists(file)).toBe(true);
    });

    it("returns true for existing directory", async () => {
      expect(await pathExists(tempDir)).toBe(true);
    });

    it("returns false for non-existent path", async () => {
      expect(await pathExists(join(tempDir, "nope"))).toBe(false);
    });

    it("returns false for deeply non-existent path", async () => {
      expect(await pathExists("/nonexistent/deep/path/file.txt")).toBe(false);
    });
  });

  describe("ensureDir", () => {
    it("creates a new directory", async () => {
      const dir = join(tempDir, "new-dir");
      await ensureDir(dir);
      expect(await pathExists(dir)).toBe(true);
    });

    it("creates nested directories", async () => {
      const dir = join(tempDir, "a", "b", "c");
      await ensureDir(dir);
      expect(await pathExists(dir)).toBe(true);
    });

    it("does not throw if directory already exists", async () => {
      await ensureDir(tempDir);
      // Should not throw
      expect(await pathExists(tempDir)).toBe(true);
    });
  });

  describe("readJson", () => {
    it("reads a valid JSON file", async () => {
      const file = join(tempDir, "data.json");
      await writeFile(file, '{"name":"test","value":42}');
      const data = await readJson<{ name: string; value: number }>(file);
      expect(data).toEqual({ name: "test", value: 42 });
    });

    it("returns null for non-existent file", async () => {
      const data = await readJson(join(tempDir, "missing.json"));
      expect(data).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
      const file = join(tempDir, "bad.json");
      await writeFile(file, "not valid json {{{");
      const data = await readJson(file);
      expect(data).toBeNull();
    });

    it("reads arrays", async () => {
      const file = join(tempDir, "array.json");
      await writeFile(file, '[1,2,3]');
      const data = await readJson<number[]>(file);
      expect(data).toEqual([1, 2, 3]);
    });

    it("reads nested objects", async () => {
      const file = join(tempDir, "nested.json");
      await writeFile(file, '{"a":{"b":{"c":true}}}');
      const data = await readJson(file);
      expect(data).toEqual({ a: { b: { c: true } } });
    });
  });

  describe("writeJson", () => {
    it("writes JSON to file", async () => {
      const file = join(tempDir, "output.json");
      await writeJson(file, { hello: "world" });
      const data = await readJson(file);
      expect(data).toEqual({ hello: "world" });
    });

    it("creates parent directories", async () => {
      const file = join(tempDir, "sub", "dir", "output.json");
      await writeJson(file, { nested: true });
      expect(await pathExists(file)).toBe(true);
      const data = await readJson(file);
      expect(data).toEqual({ nested: true });
    });

    it("pretty-prints with 2-space indent", async () => {
      const file = join(tempDir, "pretty.json");
      await writeJson(file, { a: 1, b: 2 });
      const { readFile: rf } = await import("node:fs/promises");
      const raw = await rf(file, "utf-8");
      expect(raw).toContain("  "); // Has indentation
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("overwrites existing file", async () => {
      const file = join(tempDir, "overwrite.json");
      await writeJson(file, { first: true });
      await writeJson(file, { second: true });
      const data = await readJson(file);
      expect(data).toEqual({ second: true });
    });

    it("handles special values", async () => {
      const file = join(tempDir, "special.json");
      await writeJson(file, { arr: [1, null, "str"], empty: {} });
      const data = await readJson(file);
      expect(data).toEqual({ arr: [1, null, "str"], empty: {} });
    });
  });
});
