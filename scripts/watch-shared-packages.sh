#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:-/workspace}"
POLL_INTERVAL="${2:-3}"

pkg_hash() {
  find "$WORKSPACE/packages/contracts/src" "$WORKSPACE/packages/db/src" "$WORKSPACE/packages/service-utils/src" \
    -name "*.ts" -exec md5sum {} + 2>/dev/null | sort | md5sum | cut -d' ' -f1
}

last_hash="$(pkg_hash)"

while true; do
  sleep "$POLL_INTERVAL"
  current_hash="$(pkg_hash)"
  if [[ "$current_hash" != "$last_hash" ]]; then
    echo "[watch-shared-packages] Change detected, rebuilding..." >&2
    pnpm --filter @script-manifest/contracts build 2>&1 | tail -1
    pnpm --filter @script-manifest/db build 2>&1 | tail -1
    pnpm --filter @script-manifest/service-utils build 2>&1 | tail -1
    last_hash="$current_hash"
    echo "[watch-shared-packages] Rebuild complete" >&2
  fi
done
