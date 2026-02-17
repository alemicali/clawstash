import { describe, it, expect } from "vitest";
import { getStorageEndpoint, getResticRepoUrl, type StorageConfig } from "../src/core/config.js";

describe("getStorageEndpoint", () => {
  it("builds R2 endpoint from accountId", () => {
    const storage: StorageConfig = {
      provider: "r2",
      bucket: "test",
      accountId: "abc123",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(getStorageEndpoint(storage)).toBe(
      "https://abc123.r2.cloudflarestorage.com",
    );
  });

  it("throws for R2 without accountId", () => {
    const storage: StorageConfig = {
      provider: "r2",
      bucket: "test",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(() => getStorageEndpoint(storage)).toThrow("R2 requires an accountId");
  });

  it("builds S3 endpoint with default region", () => {
    const storage: StorageConfig = {
      provider: "s3",
      bucket: "test",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(getStorageEndpoint(storage)).toBe(
      "https://s3.us-east-1.amazonaws.com",
    );
  });

  it("builds S3 endpoint with custom region", () => {
    const storage: StorageConfig = {
      provider: "s3",
      bucket: "test",
      region: "eu-west-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(getStorageEndpoint(storage)).toBe(
      "https://s3.eu-west-1.amazonaws.com",
    );
  });

  it("uses custom endpoint when provided", () => {
    const storage: StorageConfig = {
      provider: "minio",
      bucket: "test",
      endpoint: "https://minio.local:9000",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(getStorageEndpoint(storage)).toBe("https://minio.local:9000");
  });
});

describe("getResticRepoUrl", () => {
  it("builds restic repo URL", () => {
    const storage: StorageConfig = {
      provider: "r2",
      bucket: "my-backup",
      accountId: "abc123",
      accessKeyId: "key",
      secretAccessKey: "secret",
    };
    expect(getResticRepoUrl(storage)).toBe(
      "s3:https://abc123.r2.cloudflarestorage.com/my-backup",
    );
  });
});
