#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspace}"
LOCK_FILE="$WORKSPACE/.pnpm-install.lock"
MARKER_FILE="$WORKSPACE/node_modules/.pnpm-install.complete"
BUILD_MARKER_FILE="$WORKSPACE/node_modules/.workspace-packages-built"
flock "$LOCK_FILE" bash -lc "
  set -euo pipefail
  cd \"$WORKSPACE\"
  if [[ \"${FORCE_PNPM_INSTALL:-0}\" == \"1\" || ! -f \"$MARKER_FILE\" ]]; then
    CI=true pnpm install --force --frozen-lockfile=false
    mkdir -p \"$(dirname "$MARKER_FILE")\"
    touch \"$MARKER_FILE\"
  fi
  if [[ \"${FORCE_PNPM_INSTALL:-0}\" == \"1\" || ! -f \"$BUILD_MARKER_FILE\" || \"$WORKSPACE/packages/contracts/src/index.ts\" -nt \"$BUILD_MARKER_FILE\" || \"$WORKSPACE/packages/db/src/index.ts\" -nt \"$BUILD_MARKER_FILE\" ]]; then
    pnpm --filter @script-manifest/contracts build
    pnpm --filter @script-manifest/db build
    mkdir -p \"$(dirname "$BUILD_MARKER_FILE")\"
    touch \"$BUILD_MARKER_FILE\"
  fi
"
