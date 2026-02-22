#!/usr/bin/env bash
set -uo pipefail

service_rc=0
web_rc=0

pnpm run test:coverage:services || service_rc=$?
pnpm run test:coverage:web || web_rc=$?

if (( service_rc != 0 || web_rc != 0 )); then
  echo "Coverage failed: services=${service_rc}, web=${web_rc}" >&2
  exit 1
fi

echo "Coverage completed successfully."
