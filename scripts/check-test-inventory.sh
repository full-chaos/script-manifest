#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRITER_WEB_ROOT="$REPO_ROOT/apps/writer-web"
WRITER_WEB_APP_DIR="$WRITER_WEB_ROOT/app"

MIN_PAGE_TESTS=8
MIN_ROUTE_TESTS=5

page_test_count="$(find "$WRITER_WEB_APP_DIR" -type f \( -name 'page.test.ts' -o -name 'page.test.tsx' \) | wc -l | tr -d '[:space:]')"
route_test_count="$(find "$WRITER_WEB_APP_DIR" -type f -name 'route.test.ts' | wc -l | tr -d '[:space:]')"

echo "Detected page tests: $page_test_count"
echo "Detected route tests: $route_test_count"

declare -a critical_tests=(
  "app/page.test.tsx"
  "app/signin/page.test.tsx"
  "app/profile/page.test.tsx"
  "app/projects/page.test.tsx"
  "app/submissions/page.test.tsx"
  "app/competitions/page.test.tsx"
  "app/leaderboard/page.test.tsx"
  "app/api/v1/scripts/upload/route.test.ts"
  "app/api/v1/scripts/upload-session/route.test.ts"
  "app/api/v1/scripts/register/route.test.ts"
)

errors=0

if (( page_test_count < MIN_PAGE_TESTS )); then
  echo "ERROR: Expected at least $MIN_PAGE_TESTS page tests, found $page_test_count."
  errors=1
fi

if (( route_test_count < MIN_ROUTE_TESTS )); then
  echo "ERROR: Expected at least $MIN_ROUTE_TESTS route tests, found $route_test_count."
  errors=1
fi

for relative_path in "${critical_tests[@]}"; do
  absolute_path="$WRITER_WEB_ROOT/$relative_path"
  if [[ ! -f "$absolute_path" ]]; then
    echo "ERROR: Missing critical test file: $relative_path"
    errors=1
  fi
done

if (( errors > 0 )); then
  echo "Test inventory check failed."
  exit 1
fi

echo "Test inventory check passed."
