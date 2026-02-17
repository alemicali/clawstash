# Contributing to clawstash

Thanks for your interest in contributing.

## How to contribute

1. **Fork** the repo and clone your fork
2. Create a branch from `main` with a descriptive name:
   - `feat/glacier-support` — new feature
   - `fix/keychain-fallback` — bug fix
   - `docs/setup-guide` — documentation
   - `refactor/config-loader` — code cleanup
   - `test/restore-command` — tests
3. Make your changes and push to your fork
4. Open a **Pull Request** against `main`
5. CI must pass (Node 18, 20, 22, 24)
6. A maintainer will review and squash-merge

Direct pushes to `main` are blocked. All changes go through PRs.

## Development

```bash
git clone https://github.com/<your-username>/clawstash
cd clawstash
npm install
npm run dev -- setup    # Run CLI in dev mode
npm test                # Run tests
npm run build           # Build for production
```

## Project structure

```
src/
  cli/       Command implementations (Commander.js)
  core/      Business logic (config, restic, keychain, openclaw scanner)
  utils/     Shared utilities (platform, logger, fs helpers)
test/        Vitest tests
website/     Landing page (Vite + React)
```

## Guidelines

- TypeScript, ESM, Node >= 18
- Run `npm test` before submitting a PR
- Run `npm run build` and make sure there are no warnings
- Keep dependencies minimal — we have 4 runtime deps, let's keep it that way
- Update CHANGELOG.md if the change is user-facing
- No AI slop in docs or code comments

## Reporting bugs

Open an issue at https://github.com/alemicali/clawstash/issues with:

1. What you expected
2. What happened
3. Output of `clawstash doctor`
4. OS and Node version
