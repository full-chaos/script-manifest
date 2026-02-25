#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspace}"
LOCK_FILE="$WORKSPACE/.pnpm-install.lock"
MARKER_FILE="$WORKSPACE/node_modules/.pnpm-install.complete"
PLATFORM_MARKER_FILE="$WORKSPACE/node_modules/.pnpm-install.platform"
BUILD_MARKER_FILE="$WORKSPACE/node_modules/.workspace-packages-built"

current_platform="$(node -p '`${process.platform}-${process.arch}`')"

flock "$LOCK_FILE" bash -lc "
set -euo pipefail
cd \"$WORKSPACE\"

installed_platform=\"\"
if [[ -f \"$PLATFORM_MARKER_FILE\" ]]; then
  installed_platform=\"\$(cat \"$PLATFORM_MARKER_FILE\" 2>/dev/null || true)\"
fi

needs_install=0
if [[ \"\${FORCE_PNPM_INSTALL:-0}\" == \"1\" || ! -f \"$MARKER_FILE\" ]]; then
  needs_install=1
elif [[ \"\$installed_platform\" != \"$current_platform\" ]]; then
  echo \"pnpm install marker platform mismatch: have '\$installed_platform', need '$current_platform'. Reinstalling.\" >&2
  needs_install=1
fi

if [[ \"\$needs_install\" == \"1\" ]]; then
  CI=true pnpm install --force --frozen-lockfile=false
  mkdir -p \"$(dirname "$MARKER_FILE")\"
  touch \"$MARKER_FILE\"
  printf '%s' \"$current_platform\" > \"$PLATFORM_MARKER_FILE\"
fi

if [[ \"\${FORCE_PNPM_INSTALL:-0}\" == \"1\" || ! -f \"$BUILD_MARKER_FILE\" || \"$WORKSPACE/packages/contracts/src/index.ts\" -nt \"$BUILD_MARKER_FILE\" || \"$WORKSPACE/packages/db/src/index.ts\" -nt \"$BUILD_MARKER_FILE\" ]]; then
  pnpm --filter @script-manifest/contracts build
  pnpm --filter @script-manifest/db build
  mkdir -p \"$(dirname "$BUILD_MARKER_FILE")\"
  touch \"$BUILD_MARKER_FILE\"
fi
"
