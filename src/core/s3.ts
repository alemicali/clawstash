import { createHmac, createHash } from "node:crypto";
import { log } from "../utils/logger.js";
import type { StorageConfig } from "./config.js";
import { getStorageEndpoint } from "./config.js";

// ─── AWS Signature V4 (minimal, zero-dependency) ─────────────────────────────

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(
  secretKey: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function signRequest(opts: {
  method: string;
  endpoint: string;
  path: string;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): SignedRequest {
  const { method, endpoint, path, body, accessKeyId, secretAccessKey, region } =
    opts;

  const url = new URL(path, endpoint);
  const host = url.host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(body);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    method,
    url.pathname,
    url.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: url.toString(),
    headers: {
      Host: host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authorization,
    },
  };
}

// ─── S3 Bucket Operations ────────────────────────────────────────────────────

/**
 * Check if a bucket exists and is accessible.
 */
export async function bucketExists(storage: StorageConfig): Promise<boolean> {
  const endpoint = getStorageEndpoint(storage);
  const region = storage.region ?? "auto";

  const { url, headers } = signRequest({
    method: "HEAD",
    endpoint,
    path: `/${storage.bucket}`,
    body: "",
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region,
  });

  try {
    const res = await fetch(url, { method: "HEAD", headers });
    log.debug(`HEAD /${storage.bucket}: ${res.status}`);
    return res.status === 200;
  } catch (err) {
    log.debug(`HEAD bucket failed: ${err}`);
    return false;
  }
}

/**
 * Create a new S3 bucket. Returns true if created, false if it already exists.
 * Throws on permission or network errors.
 */
export async function createBucket(storage: StorageConfig): Promise<boolean> {
  const endpoint = getStorageEndpoint(storage);
  const region = storage.region ?? "auto";

  const { url, headers } = signRequest({
    method: "PUT",
    endpoint,
    path: `/${storage.bucket}`,
    body: "",
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region,
  });

  const res = await fetch(url, { method: "PUT", headers });

  if (res.status === 200 || res.status === 201) {
    log.debug(`Bucket "${storage.bucket}" created`);
    return true;
  }

  // Already exists and owned by us
  if (res.status === 409) {
    log.debug(`Bucket "${storage.bucket}" already exists`);
    return false;
  }

  // Parse error
  const body = await res.text();
  log.debug(`CreateBucket response: ${res.status} ${body}`);

  // BucketAlreadyOwnedByYou
  if (body.includes("BucketAlreadyOwnedByYou")) {
    return false;
  }

  throw new Error(
    `Failed to create bucket "${storage.bucket}": ${res.status} — ${body}`,
  );
}

/**
 * Ensure a bucket exists, creating it if necessary.
 */
export async function ensureBucket(storage: StorageConfig): Promise<void> {
  const exists = await bucketExists(storage);
  if (exists) {
    log.debug(`Bucket "${storage.bucket}" already exists`);
    return;
  }

  await createBucket(storage);
}
