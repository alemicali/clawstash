import { describe, it, expect } from "vitest";
import { formatBytes, formatDuration, formatTimeAgo } from "../src/utils/fs.js";

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024 * 156)).toBe("156 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 ** 3 * 2.5)).toBe("2.5 GB");
  });
});

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(0.5)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(4.2)).toBe("4.2s");
  });

  it("formats minutes", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("formats hours", () => {
    expect(formatDuration(3661)).toBe("1h 1m");
  });
});

describe("formatTimeAgo", () => {
  it("formats recent time", () => {
    expect(formatTimeAgo(new Date())).toBe("just now");
  });

  it("formats minutes ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatTimeAgo(date)).toBe("5 minutes ago");
  });

  it("formats hours ago", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatTimeAgo(date)).toBe("3 hours ago");
  });

  it("formats days ago", () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(formatTimeAgo(date)).toBe("7 days ago");
  });
});
