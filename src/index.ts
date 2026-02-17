// Public API — for programmatic usage
export type {
  ClawstashConfig,
  StorageConfig,
  RetentionConfig,
  DaemonConfig,
} from "./core/config.js";

export {
  loadConfig,
  saveConfig,
  requireConfig,
  getResticRepoUrl,
  getStorageEndpoint,
} from "./core/config.js";

export {
  scanOpenClawDir,
  isOpenClawRunning,
  categorizeFile,
  type OpenClawScanResult,
  type OpenClawFile,
  type FileCategory,
} from "./core/openclaw.js";

export {
  backup,
  restore,
  listSnapshots,
  forget,
  stats,
  check,
  initRepo,
  checkRepo,
  type ResticSnapshot,
  type ResticBackupSummary,
  type ResticStats,
} from "./core/restic.js";

export {
  ensureRestic,
  isResticInstalled,
  getResticVersion,
} from "./core/restic-installer.js";

export { runHealthChecks, type HealthCheck } from "./core/health.js";

export {
  ensureBucket,
  createBucket,
  bucketExists,
  testEndpoint,
  detectR2Jurisdiction,
} from "./core/s3.js";

export {
  getPassphrase as getKeychainPassphrase,
  setPassphrase as setKeychainPassphrase,
  deletePassphrase as deleteKeychainPassphrase,
  isKeychainAvailable,
} from "./core/keychain.js";
