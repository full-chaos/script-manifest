# Phase 1 Testing Automation Guide

Last updated: 2026-02-22

## What Phase A Added

- Split CI workflow jobs in `.github/workflows/ci.yml`:
  - `lint-typecheck`
  - `unit-and-component`
  - `build`
  - `coverage-artifacts`
  - `compose-config`
- Added root test scripts in `package.json`:
  - `test:services`
  - `test:web`
  - `test:unit`
  - `test:coverage`
  - `test:coverage:services`
  - `test:coverage:web`
  - `test:inventory`
- Added inventory guard script:
  - `scripts/check-test-inventory.sh`

## What Phase B Added

- Expanded root unit suite in `package.json`:
  - `test:packages` runs package-level tests.
  - `test:services` now includes all services (including coverage marketplace).
  - `test:unit` now runs package + service + web tests.
- Added API gateway helper unit tests:
  - `services/api-gateway/src/helpers.test.ts`
- Added contract package tests:
  - `packages/contracts/test/index.test.ts`
- Added DB package tests:
  - `packages/db/test/index.test.ts`
- Expanded proxy route coverage in:
  - `apps/writer-web/app/api/v1/_proxy.test.ts`
- Inventory guard now enforces Phase B critical tests.

## What Phase C Added

- Added compose-backed integration harness script:
  - `scripts/compose-integration-harness.sh`
  - Commands: `up`, `down`, `reset`, `test`
- Added root integration scripts in `package.json`:
  - `test:integration` (runs integration flow tests against running compose stack)
  - `test:integration:compose` (resets stack + runs integration tests + tears down)
- Added real multi-service flow tests in `tests/integration/compose/`:
  - `script-upload-register-view.test.ts`
  - `submission-ranking-flow.test.ts`
  - `coverage-order-flow.test.ts`
  - `feedback-exchange-flow.test.ts`
- CI now runs compose integration in a dedicated job:
  - `.github/workflows/ci.yml` job `integration-compose`

## What Phase D Added

- Added Playwright E2E test project:
  - Config: `tests/e2e/playwright.config.ts`
  - Specs:
    - `tests/e2e/home.spec.ts`
    - `tests/e2e/signin.spec.ts`
    - `tests/e2e/profile-projects.spec.ts`
- Added accessibility assertions using Axe:
  - `tests/e2e/support/a11y.ts`
- Added responsive viewport matrix:
  - `chromium-desktop`
  - `chromium-tablet`
  - `chromium-mobile`
- Added visual regression snapshots on high-risk pages:
  - Home (logged-out)
  - Sign in (authenticated state)
  - Profile (authenticated state)
- Added root scripts:
  - `test:e2e`
  - `test:e2e:update`
- CI now runs Playwright in dedicated job:
  - `.github/workflows/ci.yml` job `e2e-ux`
- Inventory guard now enforces Phase D critical e2e files.

## What Phase E Added

- Added nightly reliability workflow:
  - `.github/workflows/nightly-reliability.yml`
  - Includes lint, typecheck, unit, inventory, compose integration, e2e, and coverage.
- Added ops-level reliability scripts:
  - `scripts/ci/coverage-thresholds.mjs`
  - `scripts/ci/playwright-flake-report.mjs`
- Added ops unit tests:
  - `scripts/ci/coverage-thresholds.test.mjs`
  - `scripts/ci/playwright-flake-report.test.mjs`
- Added quarantine control file:
  - `tests/e2e/quarantine.list`
- Added baseline coverage threshold config:
  - `.github/coverage-thresholds.json`
- Added repeated-failure issue automation for nightly regressions on `main`.
- `test:unit` now includes `test:ops` so reliability checks run on every unit pass.

## Running Locally

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:integration:compose
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
pnpm run test:inventory
pnpm run test:coverage
pnpm run test:ops
```

You can also keep the stack up while iterating:

```bash
bash ./scripts/compose-integration-harness.sh up
pnpm run test:integration
bash ./scripts/compose-integration-harness.sh down
```

## Coverage Artifact Paths

- Services coverage output: `.coverage/services`
- Writer web coverage output: `apps/writer-web/coverage`

These are the same paths uploaded by the `coverage-artifacts` CI job.

Nightly reliability additionally uploads:

- `.artifacts/playwright-flakes.json`
- `.artifacts/playwright-flakes.md`
- `.artifacts/coverage-thresholds-ratchet.json`

### Managing Coverage Thresholds

- Baseline file:
  - `.github/coverage-thresholds.json`
- Gate command:

```bash
node scripts/ci/coverage-thresholds.mjs \
  --baseline .github/coverage-thresholds.json \
  --services-summary .coverage/services/coverage-summary.json \
  --web-summary apps/writer-web/coverage/coverage-summary.json \
  --ratchet-out .artifacts/coverage-thresholds-ratchet.json
```

- When coverage improves, promote ratcheted values from `.artifacts/coverage-thresholds-ratchet.json` into `.github/coverage-thresholds.json`.

### Managing Flaky E2E Quarantine

- Quarantine file:
  - `tests/e2e/quarantine.list`
- Flake summary command:

```bash
node scripts/ci/playwright-flake-report.mjs \
  --input .artifacts/playwright-results.json \
  --output .artifacts/playwright-flakes.json \
  --markdown .artifacts/playwright-flakes.md \
  --quarantine-file tests/e2e/quarantine.list
```

- Add one substring pattern per line matching:
  - `<projectName> <suite/spec title>`

## Inventory Guard Rules

`scripts/check-test-inventory.sh` fails when:

- page test files drop below `8`
- route test files drop below `5`
- any critical tests are missing:
  - `apps/writer-web/app/page.test.tsx`
  - `apps/writer-web/app/signin/page.test.tsx`
  - `apps/writer-web/app/profile/page.test.tsx`
  - `apps/writer-web/app/projects/page.test.tsx`
  - `apps/writer-web/app/submissions/page.test.tsx`
  - `apps/writer-web/app/competitions/page.test.tsx`
  - `apps/writer-web/app/leaderboard/page.test.tsx`
  - `apps/writer-web/app/api/v1/scripts/upload/route.test.ts`
  - `apps/writer-web/app/api/v1/scripts/upload-session/route.test.ts`
  - `apps/writer-web/app/api/v1/scripts/register/route.test.ts`
  - `services/api-gateway/src/helpers.test.ts`
  - `packages/contracts/test/index.test.ts`
  - `packages/db/test/index.test.ts`
