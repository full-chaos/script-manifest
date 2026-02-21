# Testing Inventory, Gaps, and Automation Plan

Last updated: 2026-02-21

## 1) Current Testing Structure

## Runners and Frameworks

- Service tests: Node native test runner (`node --test`) + `tsx`
- Web app tests: Vitest + React Testing Library + JSDOM
- CI execution: GitHub Actions (`.github/workflows/ci.yml`) running `pnpm test`, `pnpm typecheck`, `pnpm build`

## Test File Inventory

- Total test files: `30`
- Approx test cases (`it/test`): `166`
- Service test files: `14`
- Web app test files: `16`
- Package test files (`packages/contracts`, `packages/db`): `0`

## Coverage Breadth Signals

- Next page tests: `8 / 18` (`44%`)
- Next API route tests: `5 / 79` (`6%`)
- Services with at least one test: all services
- Services primarily rely on `buildServer(...).inject(...)` tests with in-memory repositories/mocks
- Browser e2e test project: none
- UX regression suites (a11y/visual/responsive): none

## Existing Test Types

- Unit tests (limited):
  - `services/ranking-service/src/scoring.test.ts`
  - selected helper-level tests in writer web (`app/lib/scriptUpload.test.ts`)
- Service integration tests (single-service HTTP):
  - each service validates route behavior via Fastify inject
- Gateway integration tests:
  - proxy path validation + one mocked platform flow (`services/api-gateway/src/platform-flow.test.ts`)
- UI behavior tests:
  - page/component tests in `apps/writer-web/app/**/*.test.tsx`

## What Is Not Present Today

- Browser end-to-end suite (Playwright/Cypress test project)
- Visual regression suite
- Accessibility (axe/lighthouse) automation
- Real infrastructure integration tests (Postgres/MinIO/OpenSearch-backed test stage)
- Coverage thresholds or coverage quality gate in CI
- Lint gate in CI

## Tested vs Untested Surface (Phase 1 Scope)

Untested writer-web pages (`page.tsx` with no `page.test.tsx`):
- `apps/writer-web/app/coverage/admin/disputes/page.tsx`
- `apps/writer-web/app/coverage/become-provider/page.tsx`
- `apps/writer-web/app/coverage/dashboard/page.tsx`
- `apps/writer-web/app/coverage/order/[serviceId]/page.tsx`
- `apps/writer-web/app/coverage/orders/[id]/page.tsx`
- `apps/writer-web/app/coverage/page.tsx`
- `apps/writer-web/app/coverage/providers/[id]/page.tsx`
- `apps/writer-web/app/feedback/page.tsx`
- `apps/writer-web/app/projects/[scriptId]/viewer/page.tsx`
- `apps/writer-web/app/rankings/methodology/page.tsx`

Next API route proxy coverage gaps (`route.ts` with no `route.test.ts`):
- `74 / 79` routes are currently untested.
- Highest-risk untested groups:
  - auth routes under `apps/writer-web/app/api/v1/auth/**`
  - projects/drafts/co-writers under `apps/writer-web/app/api/v1/projects/**`
  - submissions/placements under `apps/writer-web/app/api/v1/submissions/**` and `apps/writer-web/app/api/v1/placements/**`
  - script access/view under `apps/writer-web/app/api/v1/scripts/**`
  - feedback/coverage admin and workflow routes under `apps/writer-web/app/api/v1/feedback/**` and `apps/writer-web/app/api/v1/coverage/**`

## 2) Gap Analysis by Test Layer

## Unit Test Gaps

High priority:
- No unit tests for `services/api-gateway/src/helpers.ts` (auth/header/query/error utility logic).
- No unit tests for `packages/contracts` schema behavior (critical validation contracts).
- No unit tests for `packages/db` SQL adapters/repository helpers.

Medium priority:
- Business-rule units in coverage/feedback services are mostly exercised through large endpoint tests, not isolated logic units.

## Integration Test Gaps

High priority:
- DB-backed services are tested mainly with in-memory repositories; real persistence behaviors are unverified (migrations, constraints, transaction edges).
- No compose-based integration suite that boots service dependencies and validates true inter-service communication.

Medium priority:
- External boundary integrations (MinIO/OpenSearch/Stripe webhook semantics) are mostly mocked.
- API gateway integration tests validate happy paths, but there is low coverage on downstream timeout/retry/error translation behavior.

## End-to-End (E2E) Gaps

Critical:
- No automated multi-service browser journey tests for core user flows:
  - sign-in/register
  - create project/draft/upload
  - submission + placement updates
  - feedback listing/review lifecycle
  - coverage order lifecycle

## UX Test Gaps

Critical:
- No accessibility regression automation (keyboard/focus/landmarks/color contrast checks).
- No visual regression snapshots for key pages/components.
- No responsive viewport test matrix (mobile/tablet/desktop) in automated CI.

Coverage hotspots currently untested:
- Coverage pages (`/coverage/*`) lack page tests.
- Feedback page lacks page tests.
- Ranking methodology page lacks page tests.
- Most Next API route proxies currently have no direct route tests.

## CI / Automation Gaps

High priority:
- CI does not run `pnpm lint`.
- CI has no coverage report upload/comment/threshold gate.
- CI does not separate fast checks vs heavier checks (no test tiering).
- No nightly reliability/performance suite.
- No PR-required browser journey gate for critical writer flows.

## 3) Automation-First Plan to Close Gaps

## Phase A: Baseline and Fast Gates (1-2 days)

Goals:
- Introduce measurable quality bars without slowing PR feedback too much.

Deliverables:
- Add coverage output for Vitest + Node test runner summary collection.
- Add CI `lint` job and fail on lint/typecheck/test errors.
- Add test inventory script to fail if orphaned critical pages/routes lose test coverage targets.

Implementation:
- Update `.github/workflows/ci.yml` jobs:
  - `lint-typecheck` (`pnpm lint`, `pnpm typecheck`)
  - `unit-and-component` (`pnpm test`)
  - `compose-config`
- Add artifact upload:
  - test results (`junit`/json)
  - coverage summaries
- Add scripts:
  - `test:unit`
  - `test:services`
  - `test:web`
  - `test:coverage`

Acceptance:
- PRs must pass lint + typecheck + unit/component tests.
- Coverage artifacts uploaded on every PR.

## Phase B: Unit + Contract Expansion (3-5 days)

Goals:
- Increase deterministic coverage of core logic and contracts.

Deliverables:
- Add unit suites for:
  - `services/api-gateway/src/helpers.ts`
  - `packages/contracts`
  - `packages/db` query/repository modules
- Add route proxy table-driven tests for critical Next API routes.
- Add contract tests for gateway-to-service payload expectations.
- Add explicit error-path tests for upload and proxy routes (timeouts, invalid tokens, malformed responses).

Automation:
- Add per-package coverage thresholds (start modest, ratchet upward).
- Enforce thresholds only on touched packages initially to reduce migration friction.

Acceptance:
- New helper/contract packages have first-class unit tests.
- Gateway helper regressions break CI immediately.

## Phase C: Real Integration Harness (4-7 days)

Goals:
- Validate behavior with real infra dependencies.

Deliverables:
- New compose-based integration test harness (separate profile/file) that boots:
  - Postgres
  - MinIO
  - OpenSearch
  - target services + gateway
- Integration suites for:
  - upload/register/view script flow
  - submission + placement + ranking recompute flow
  - coverage order + dispute flow
  - feedback token/listing/review/dispute flow
- Add deterministic seeded fixtures and a reset utility for test isolation.

Automation:
- Add CI job `integration-compose` (runs on PR, with caching and timeout).
- Persist logs/artifacts on failure for triage.

Acceptance:
- Cross-service flows run against real dependencies in CI.
- Failures provide actionable logs and service health snapshots.

## Phase D: E2E + UX Guardrails (4-7 days)

Goals:
- Catch user-visible regressions before release.

Deliverables:
- Add Playwright test project (`apps/writer-web-e2e` or within `apps/writer-web`).
- Core journey suites:
  - auth + onboarding
  - project/draft upload
  - submissions/placements
  - feedback listing and review
  - coverage browse and order initiation
- Accessibility checks using axe in Playwright.
- Visual snapshot baselines for high-risk pages.
- Responsive viewport matrix (`mobile`, `tablet`, `desktop`).
- Add smoke UX assertions for nav consistency and logged-out/logged-in IA regressions.

Automation:
- Add CI job `e2e-ux` after integration harness passes.
- Retry policy for flaky browser tests + failure video/screenshot artifacts.

Acceptance:
- Core product journeys are automatically validated in a real browser.
- Accessibility and visual regressions become merge blockers.

## Phase E: Reliability and Continuous Quality (ongoing)

Goals:
- Keep regressions from creeping back in over time.

Deliverables:
- Nightly workflow:
  - full compose integration suite
  - e2e suite
  - optional smoke load tests for gateway and core services
- Flake tracking dashboard (test failure rate by suite/test id).
- Periodic threshold ratcheting process (coverage, test depth).
- Auto-quarantine policy for flaky tests with owner assignment.

Automation:
- Add `nightly-quality.yml` workflow.
- Auto-file issue on repeated nightly failures.

Acceptance:
- Nightly suite catches drift before it reaches users.
- Flaky tests are visible, triaged, and reduced continuously.

## 4) Recommended Work Breakdown (Beads/Linear)

Feature:
- `script-manifest-mlc` / `CHAOS-406` — Testing coverage inventory and automation roadmap

Tasks:
- `script-manifest-mlc.1` / `CHAOS-407` — Inventory current unit/integration/e2e/ux structure
- `script-manifest-mlc.2` / `CHAOS-408` — Identify risk-ranked missing coverage matrix
- `script-manifest-mlc.3` / `CHAOS-409` — Define automated strategy and CI expansion
- `script-manifest-mlc.4` / `CHAOS-410` — Publish phased implementation plan

Proposed next implementation tasks (new follow-on feature after this plan):
1. Add lint + coverage artifacts and split CI jobs.
2. Add api-gateway helper unit tests and contracts/db unit tests.
3. Add compose integration harness and first three end-to-end backend flows.
4. Add Playwright journeys + axe + visual snapshots for critical pages.

## 5) Immediate High-ROI Test Additions

If only 1 sprint is available, prioritize:
1. `services/api-gateway/src/helpers.test.ts` (unit)
2. Integration test harness for script upload + register + viewer flow (compose)
3. Playwright auth + project upload journey (e2e)
4. Accessibility check on header/navigation + sign-in + projects pages (ux)
