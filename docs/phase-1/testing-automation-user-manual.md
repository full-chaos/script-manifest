# Phase 1 Testing Automation Guide

Last updated: 2026-02-21

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

## Running Locally

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:inventory
pnpm run test:coverage
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

## Current Known Baseline Blocker

`services/coverage-marketplace-service` currently fails tests and typecheck because of missing exports from shared packages. This is pre-existing and causes:

- `pnpm run test:unit` to fail during service tests
- `pnpm run test:coverage:services` to fail after producing partial coverage output

