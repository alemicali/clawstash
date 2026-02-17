<p align="center">
  <img src=".github/assets/logo-light.png" alt="Clawstash" width="400" />
</p>

<p align="center">
  Encrypted incremental backups for <a href="https://openclaw.ai">OpenClaw</a>.<br />
  Set it up once, never think about it again.
</p>

<p align="center">
  <a href="https://github.com/alemicali/clawstash/actions"><img src="https://github.com/alemicali/clawstash/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/clawstash"><img src="https://img.shields.io/npm/v/clawstash" alt="npm" /></a>
  <a href="https://github.com/alemicali/clawstash/blob/main/LICENSE"><img src="https://img.shields.io/github/license/alemicali/clawstash" alt="MIT License" /></a>
</p>

---

OpenClaw stores your config, credentials, workspace, sessions, and memory in `~/.openclaw/`. If your disk dies, you lose everything. **clawstash** fixes that with encrypted, deduplicated, incremental backups to any S3-compatible storage.

## Install

Requires **Node >= 18**.

```bash
# One-liner (detects your package manager)
curl -fsSL https://clawstash.io/install.sh | bash

# Or directly via npm / pnpm / bun
npm install -g clawstash
pnpm add -g clawstash
bun add -g clawstash

# Or run without installing
npx clawstash setup
```

## Quick start

```bash
# Interactive setup wizard (2 minutes)
clawstash setup

# That's it. The daemon backs up every hour.
# Check status anytime:
clawstash status

# Disaster recovery on a new machine:
clawstash restore
```

## How it works

clawstash is a wrapper around [restic](https://restic.net), the battle-tested backup tool. It auto-downloads the restic binary (~15MB) on first run — you don't need to install anything else.

```
~/.openclaw/                          S3-compatible storage
  openclaw.json                       (Cloudflare R2, AWS S3,
  .env                    ──encrypt──  Backblaze B2, MinIO)
  credentials/            ──dedup───▶
  workspace/              ──upload──   Only changed blocks
  skills/                              get transferred.
  agents/                              AES-256 encrypted.
  settings/
  memory/
```

**First backup**: full upload (~size of your `~/.openclaw`).
**Subsequent backups**: only changed blocks. Change 1 byte in a 200MB SQLite file? ~4KB uploaded.

## What gets backed up

clawstash backs up the entire `~/.openclaw/` directory. Everything inside is captured automatically — if OpenClaw adds new folders in future versions, they're included without any clawstash update needed.

For display and selective restore, files are categorized:

| Category | Examples | Contents |
|----------|----------|----------|
| Config | `openclaw.json`, `.env` | All configuration |
| Secrets | `credentials/`, `auth/` | Channel auth, API keys |
| Workspace | `workspace/`, `workspace-*/` | Skills, AGENTS.md, SOUL.md, MEMORY.md, daily memory logs, canvas |
| Sessions | `agents/*/sessions/*.jsonl` | Conversation transcripts |
| Memory | `memory/*.sqlite` | Vector memory databases |
| Skills | `skills/` | Managed/local skills |
| Agents | `agents/*/agent/` | Per-agent config, custom model providers |
| Settings | `settings/` | TTS preferences, other settings |

### Excluded automatically

Lock files, SQLite WAL/SHM, temp files, caches, `node_modules`, sandbox workspaces, QMD model caches, OS junk (`.DS_Store`, `Thumbs.db`).

## Commands

```
clawstash setup                    Interactive wizard: storage, encryption, schedule
clawstash backup                   Run incremental backup
clawstash backup --dry-run         Show what would be backed up
clawstash backup --only workspace  Backup only workspace files
clawstash restore                  Restore latest snapshot
clawstash restore --at "3 days ago"  Point-in-time restore
clawstash restore --only config    Restore only config files
clawstash restore --target ~/tmp   Restore to custom directory
clawstash snapshots                List all backup snapshots
clawstash status                   Show backup health and info
clawstash forget                   Apply retention policy, prune old snapshots
clawstash doctor                   Run diagnostic checks
clawstash daemon install           Install background backup service
clawstash daemon uninstall         Remove background service
clawstash daemon status            Check service status
```

## Configuration

Stored at `~/.clawstash/config.json`. Created by `clawstash setup`.

```json5
{
  "version": 1,
  "openclawDir": "~/.openclaw",
  "storage": {
    "provider": "r2",
    "bucket": "my-clawstash",
    "accountId": "...",
    "accessKeyId": "...",
    "secretAccessKey": "..."
  },
  "retention": {
    "keepLast": 7,
    "keepDaily": 30,
    "keepWeekly": 12,
    "keepMonthly": 6
  },
  "daemon": {
    "enabled": true,
    "intervalMinutes": 60,
    "quietMinutes": 5
  },
  "exclude": []
}
```

### Passphrase

The encryption passphrase is **not** stored in the config file. During setup, clawstash offers to save it to your system keychain:

- **macOS**: Keychain Access (via `security` CLI)
- **Linux**: GNOME Keyring / KDE Wallet (via `secret-tool` CLI)

The passphrase is resolved in this order:

1. `--passphrase` flag
2. `CLAWSTASH_PASSPHRASE` environment variable
3. System keychain
4. Error with instructions

You can also set it manually:

```bash
export CLAWSTASH_PASSPHRASE="your-passphrase"
```

Or add it to `~/.openclaw/.env`:

```
CLAWSTASH_PASSPHRASE=your-passphrase
```

## Supported storage providers

| Provider | Config `provider` | Notes |
|----------|-------------------|-------|
| Cloudflare R2 | `r2` | Generous free tier, no egress fees |
| AWS S3 | `s3` | Standard S3 |
| Backblaze B2 | `b2` | Affordable, S3-compatible |
| MinIO | `minio` | Self-hosted, requires custom endpoint |

## Background service

`clawstash daemon install` sets up:

- **macOS**: launchd LaunchAgent (runs as your user)
- **Linux**: systemd user timer + service

The daemon runs `clawstash backup` at the configured interval (default: every 60 minutes).

## Security

- All data is encrypted with **AES-256** before leaving your machine
- Encryption key is derived from your passphrase via scrypt (restic's default)
- Your storage provider only sees opaque encrypted blobs
- Credentials and secrets get the same encryption as everything else
- The passphrase never leaves your machine
- Keychain storage uses OS-native secure storage (macOS Keychain, libsecret)

## Selective restore

```bash
# Restore everything
clawstash restore

# Restore only config (lost your openclaw.json?)
clawstash restore --only config

# Restore only workspace (recover skills and prompts)
clawstash restore --only workspace

# Restore only sessions
clawstash restore --only sessions

# Restore to a different directory (don't overwrite current)
clawstash restore --target ~/openclaw-backup

# Restore from 3 days ago
clawstash restore --at "3 days ago"

# Restore from a specific date
clawstash restore --at "2026-02-15T10:00:00"
```

## Platforms

- **macOS** (Intel + Apple Silicon)
- **Linux** (x64 + arm64)
- **Windows** via WSL2

## Programmatic API

clawstash exports its core functions for use in other tools:

```typescript
import {
  scanOpenClawDir,
  loadConfig,
  isKeychainAvailable,
  getKeychainPassphrase,
} from "clawstash";

const scan = await scanOpenClawDir();
console.log(scan.categories);
```

## Development

```bash
git clone https://github.com/alemicali/clawstash
cd clawstash
npm install
npm run dev -- setup    # Run CLI in dev mode
npm test                # Run tests
npm run build           # Build for production
```

## Sponsors

Development sponsored by [Lumea](https://lumea.dev).

## License

MIT
