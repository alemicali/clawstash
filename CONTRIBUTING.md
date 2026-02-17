# Contributing to clawstash

Thanks for your interest in contributing.

## Development

```bash
git clone https://github.com/alemicali/clawstash
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
- Keep dependencies minimal — we have 4 runtime deps, let's keep it that way
- No AI slop in docs or code comments

## Reporting bugs

Open an issue at https://github.com/alemicali/clawstash/issues with:

1. What you expected
2. What happened
3. Output of `clawstash doctor`
4. OS and Node version
