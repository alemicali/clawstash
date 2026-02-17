# Changelog

## 0.2.0

- Auto-create S3 bucket during setup (zero-dependency AWS Signature V4)
- R2 EU jurisdiction support (automatic endpoint detection)
- Passphrase file fallback (`~/.clawstash/passphrase`, mode 600) when system keychain is unavailable
- Path-style bucket addressing for R2, MinIO, and B2 (`-o s3.bucket-lookup=path`)
- Fixed `--no-forget` flag on backup command
- Fixed version display (reads from package.json at runtime)
- Fixed daemon binary path resolution (uses `which clawstash` instead of `process.argv`)
- Changed build target from Node 22 to Node 18

## 0.1.0

Initial release.

- Interactive setup wizard (5 steps)
- Encrypted incremental backups via restic
- Auto-downloads restic binary on first run
- System keychain integration (macOS Keychain, Linux libsecret)
- Selective backup/restore by category (config, secrets, workspace, sessions, memory, skills, agents, settings)
- Point-in-time restore with relative dates (`--at "3 days ago"`)
- Background daemon (launchd on macOS, systemd on Linux)
- Retention policies with automatic pruning
- Health checks via `clawstash doctor`
- Supports Cloudflare R2, AWS S3, Backblaze B2, MinIO
- Programmatic API for integration with other tools
