#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRITER_WEB_ROOT="$REPO_ROOT/apps/writer-web"
WRITER_WEB_APP_DIR="$WRITER_WEB_ROOT/app"
E2E_TEST_DIR="$REPO_ROOT/tests/e2e"

MIN_PAGE_TESTS=8
MIN_ROUTE_TESTS=5
MIN_E2E_TESTS=3

page_test_count="$(find "$WRITER_WEB_APP_DIR" -type f \( -name 'page.test.ts' -o -name 'page.test.tsx' \) | wc -l | tr -d '[:space:]')"
route_test_count="$(find "$WRITER_WEB_APP_DIR" -type f -name 'route.test.ts' | wc -l | tr -d '[:space:]')"
e2e_test_count="$(find "$E2E_TEST_DIR" -type f -name '*.spec.ts' | wc -l | tr -d '[:space:]')"

echo "Detected page tests: $page_test_count"
echo "Detected route tests: $route_test_count"
echo "Detected e2e specs: $e2e_test_count"

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

declare -a phase_b_critical_tests=(
  "services/api-gateway/src/helpers.test.ts"
  "packages/contracts/test/index.test.ts"
  "packages/db/test/index.test.ts"
)

declare -a phase_d_critical_tests=(
  "tests/e2e/playwright.config.ts"
  "tests/e2e/home.spec.ts"
  "tests/e2e/signin.spec.ts"
  "tests/e2e/profile-projects.spec.ts"
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

if (( e2e_test_count < MIN_E2E_TESTS )); then
  echo "ERROR: Expected at least $MIN_E2E_TESTS e2e specs, found $e2e_test_count."
  errors=1
fi

for relative_path in "${critical_tests[@]}"; do
  absolute_path="$WRITER_WEB_ROOT/$relative_path"
  if [[ ! -f "$absolute_path" ]]; then
    echo "ERROR: Missing critical test file: $relative_path"
    errors=1
  fi
done

for relative_path in "${phase_b_critical_tests[@]}"; do
  absolute_path="$REPO_ROOT/$relative_path"
  if [[ ! -f "$absolute_path" ]]; then
    echo "ERROR: Missing Phase B critical test file: $relative_path"
    errors=1
  fi
done

for relative_path in "${phase_d_critical_tests[@]}"; do
  absolute_path="$REPO_ROOT/$relative_path"
  if [[ ! -f "$absolute_path" ]]; then
    echo "ERROR: Missing Phase D critical test file: $relative_path"
    errors=1
  fi
done

if (( errors > 0 )); then
  echo "Test inventory check failed."
  exit 1
fi

echo "Test inventory check passed."
