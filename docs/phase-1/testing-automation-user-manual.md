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

## Running Locally

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:integration:compose
pnpm run test:inventory
pnpm run test:coverage
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
