# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in clawstash, please report it responsibly.

**Do not open a public issue.**

Instead, email **alessio.micali@gmail.com** with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment

You will receive a response within 48 hours. If the issue is confirmed, a fix will be released as soon as possible and you will be credited in the changelog (unless you prefer to remain anonymous).

## Scope

Security issues in the following areas are in scope:

- Encryption key handling and passphrase storage
- Backup data integrity
- Credential leakage (S3 keys, passphrases)
- Code injection via CLI inputs
- Dependency vulnerabilities

## Out of Scope

- Vulnerabilities in restic itself (report to [restic/restic](https://github.com/restic/restic))
- Vulnerabilities in storage providers (R2, S3, B2)
- Social engineering attacks
