#!/usr/bin/env bash
# clawstash installer
# curl -fsSL https://clawstash.io/install.sh | sh
set -euo pipefail

BOLD="\033[1m"
DIM="\033[2m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

info()  { printf "${BOLD}%s${RESET}\n" "$1"; }
ok()    { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }
warn()  { printf "${YELLOW}  ! %s${RESET}\n" "$1"; }
fail()  { printf "${RED}  ✗ %s${RESET}\n" "$1"; exit 1; }
dim()   { printf "${DIM}    %s${RESET}\n" "$1"; }

# ── Header ───────────────────────────────────────────────────────────────────

echo ""
info "  clawstash installer"
dim "Encrypted backups for ~/.openclaw"
echo ""

# ── Detect OS & arch ────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)   PLATFORM="linux" ;;
  Darwin*)  PLATFORM="macos" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *)        fail "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64|amd64)   ARCH="x64" ;;
  aarch64|arm64)   ARCH="arm64" ;;
  *)               fail "Unsupported architecture: $ARCH" ;;
esac

ok "Detected $PLATFORM ($ARCH)"

# ── Check Node.js ────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node 18+ first: https://nodejs.org"
fi

NODE_VERSION="$(node -v | sed 's/v//' | cut -d. -f1)"
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js $NODE_VERSION found, but clawstash requires Node 18+. Upgrade: https://nodejs.org"
fi

ok "Node.js v$(node -v | sed 's/v//') found"

# ── Detect package manager ──────────────────────────────────────────────────

PM=""
PM_INSTALL=""

# Prefer npm for reliability (pnpm/bun global installs can fail without setup)
if command -v npm &>/dev/null; then
  PM="npm"
  PM_INSTALL="npm install -g clawstash"
elif command -v pnpm &>/dev/null; then
  PM="pnpm"
  PM_INSTALL="pnpm add -g clawstash"
elif command -v bun &>/dev/null; then
  PM="bun"
  PM_INSTALL="bun add -g clawstash"
else
  fail "No package manager found (npm, pnpm, or bun required)"
fi

ok "Using $PM"

# ── Install ──────────────────────────────────────────────────────────────────

echo ""
info "  Installing clawstash..."
dim "$PM_INSTALL"
echo ""

if $PM_INSTALL; then
  echo ""
  ok "clawstash installed"
else
  echo ""
  fail "Installation failed. Try running manually: $PM_INSTALL"
fi

# ── Verify ───────────────────────────────────────────────────────────────────

if ! command -v clawstash &>/dev/null; then
  warn "clawstash installed but not in PATH"
  dim "You may need to restart your shell or add the global bin to your PATH"
  echo ""
  exit 0
fi

VERSION="$(clawstash --version 2>/dev/null || echo "unknown")"
ok "clawstash $VERSION ready"

# ── Next steps ───────────────────────────────────────────────────────────────

echo ""
info "  Next steps:"
echo ""
dim "Run the setup wizard to connect your storage:"
echo ""
printf "  ${BOLD}clawstash setup${RESET}\n"
echo ""
dim "This will:"
dim "  1. Scan your ~/.openclaw directory"
dim "  2. Connect to your S3-compatible storage"
dim "  3. Set an encryption passphrase"
dim "  4. Run your first backup"
dim "  5. Optionally install a background daemon"
echo ""
