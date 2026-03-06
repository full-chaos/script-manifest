# Phase 5: Architecture Improvements (CHAOS-602)

## TL;DR

> **Quick Summary**: Implement 4 architectural improvements — async notification publishing via Redpanda/Kafka, SLA scheduler extraction from the monolithic coverage-marketplace service, home page RSC migration for faster FCP, and a proxy layer evaluation with POC.
>
> **Deliverables**:
> - Kafka producer in `@script-manifest/service-utils` replacing HTTP POST for notifications
> - Kafka consumer in `notification-service` persisting events from Redpanda
> - Extracted `scheduler.ts` module in coverage-marketplace-service
> - RSC home page shell with client-side `AuthBanner.tsx` component
> - Proxy layer audit document + 1 POC direct browser-to-gateway route
>
> **Estimated Effort**: Large (9 points across 4 sub-issues)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (kafkajs install) → T5 (Kafka producer) → T6 (Kafka consumer) → Final Verification

---

## Context

### Original Request
Implement CHAOS-602 "Phase 5 Architecture Improvements" — 4 sub-issues (CHAOS-603 through CHAOS-606) addressing event-driven notifications, service decomposition, frontend performance, and proxy layer evaluation.

### Interview Summary
**Key Discussions**:
- All 4 sub-issues validated as 0% implemented — no code exists for any
- Test strategy: TDD (write failing tests first, implement to pass)
- CHAOS-606 scope: Investigation + POC only (not full proxy removal)
- Phase 4.5 (notification PostgreSQL migration) confirmed complete (PR #245 merged)

**Research Findings**:
- Redpanda v24.3.1 in compose.yml + compose.prod.yml, Kafka API on port 9092. `kafkajs` not installed anywhere.
- `publishNotificationEvent()` in service-utils uses `undici` HTTP POST. 3 services call it via DI pattern (`options.publisher ?? publishNotificationEvent`).
- notification-service already persisted to PostgreSQL (Phase 4.5). Receives events via `POST /internal/events`.
- SLA scheduler: `runSlaMaintenance()` at index.ts:98-155 (57 lines), `setInterval` in onReady hook 161-165. Also exposed via `POST /internal/jobs/sla-maintenance`. Dependencies: repository, paymentGateway, 3 env vars.
- `scheduler.ts` does NOT exist.
- Home page `page.tsx` has `"use client"` line 1. Uses `useState`/`useEffect` for auth. Static data: `writerSurfaces` (5 items), `trustPrinciples` (3 strings). `AuthBanner.tsx` does NOT exist.
- ~80 API route files in `apps/writer-web/app/api/`. `_proxy.ts` is thin pass-through (63 lines). All routes appear to be pure proxies. CORS configured on gateway.

### Metis Review
**Identified Gaps** (addressed):
- Kafka topic auto-creation: Redpanda compose config needs `--set auto_create_topics_enabled=true` → added to T1
- Fallback mechanism: env-driven (`KAFKA_BROKERS` present → Kafka, absent → HTTP) → specified in T5
- Hydration mismatch risk: AuthBanner must render null on first paint, update in useEffect → specified in T3
- SLA scheduler per-order error handling bug: discovered but out of scope → file follow-up issue
- Route count discrepancy (80 vs ~96): will be reconciled during audit → T7
- Health check integration for Kafka: producer must connect lazily → specified in T5
- POST endpoint wiring after extraction: must still call same function from scheduler.ts → specified in T2

---

## Work Objectives

### Core Objective
Replace synchronous HTTP notification publishing with async Kafka, extract the SLA scheduler for independent operation, convert the home page to an RSC shell for faster first contentful paint, and evaluate the proxy layer with a documented recommendation.

### Concrete Deliverables
- `packages/service-utils/src/kafka.ts` — shared Kafka client factory
- `packages/service-utils/src/notificationPublisher.ts` — updated with Kafka producer (env-driven fallback to HTTP)
- `services/notification-service/src/consumer.ts` — Kafka consumer
- `services/coverage-marketplace-service/src/scheduler.ts` — extracted SLA scheduler module
- `apps/writer-web/app/components/AuthBanner.tsx` — client component for auth UI
- `apps/writer-web/app/page.tsx` — converted to RSC server component
- `docs/phase-5/proxy-layer-audit.md` — audit document with recommendation

### Definition of Done
- [ ] `pnpm test` — all tests pass across workspace
- [ ] `pnpm typecheck` — 18/18 packages pass
- [ ] All 4 sub-issue acceptance criteria met (see individual tasks)
- [ ] No regressions in existing service behavior

### Must Have
- Kafka producer in service-utils with env-driven fallback to HTTP
- Kafka consumer in notification-service persisting to PostgreSQL
- SLA scheduler in separate module, main service no longer runs setInterval
- Home page RSC shell with client AuthBanner island
- Proxy audit document classifying all routes
- 1 POC route calling gateway directly

### Must NOT Have (Guardrails)
- **CHAOS-603**: No schema registry, Avro, or Protobuf — plain JSON only. No dead letter queue or retry policies beyond kafkajs defaults. No generic "event bus" abstraction. No changes to NotificationEventEnvelope schema. No changes to the 3 calling services (profile-project, feedback-exchange, ranking) — only service-utils and notification-service. Do NOT remove HTTP POST `/internal/events` endpoint.
- **CHAOS-604**: No changes to SLA business logic. No cron library or job framework. Do NOT fix the per-order error handling bug (file separate issue). Do NOT change POST endpoint behavior. Preserve graceful shutdown.
- **CHAOS-605**: No auth mechanism changes (stays localStorage). No other page migrations. No server-side auth (cookies, middleware). No Suspense boundaries or streaming. No visual output changes (except acceptable FOUC). Keep static data in server component.
- **CHAOS-606**: No proxy route removal. No API gateway modifications. No CORS config changes. Limit POC to exactly 1 route. Output must be a document, not just code.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: `node --import tsx --test` (node:test built-in)
- **Each task**: Write failing test first, then implement to pass

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Services**: Use Bash (curl, node --test) — Run tests, assert pass counts
- **Frontend/UI**: Use Bash (pnpm build, grep) — Verify build, check directives
- **Documentation**: Use Bash (test -f, wc -l) — Verify file exists, has content

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + independent tasks, 4 parallel):
├── Task 1: Install kafkajs + Kafka client module + compose config [quick]
├── Task 2: TDD extract SLA scheduler to scheduler.ts (CHAOS-604) [deep]
├── Task 3: TDD create AuthBanner.tsx + RSC page conversion (CHAOS-605) [deep]
└── Task 4: Audit all API routes + document findings (CHAOS-606, part 1) [deep]

Wave 2 (After Wave 1 — Kafka implementation + POC, 3 parallel):
├── Task 5: TDD Kafka producer in service-utils (depends: 1) [deep]
├── Task 6: TDD Kafka consumer in notification-service (depends: 1) [deep]
└── Task 7: POC direct browser-to-gateway route (depends: 4) [unspecified-high]

Wave 3 (After Wave 2 — cross-cutting verification):
└── Task 8: Full workspace verification + Linear updates [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 5 → Task 6 → Task 8 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1 & FINAL)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1 | — | T5, T6 | 1 |
| T2 | — | T8 | 1 |
| T3 | — | T8 | 1 |
| T4 | — | T7 | 1 |
| T5 | T1 | T8 | 2 |
| T6 | T1 | T8 | 2 |
| T7 | T4 | T8 | 2 |
| T8 | T2, T3, T5, T6, T7 | F1-F4 | 3 |
| F1-F4 | T8 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `deep`, T3 → `deep`, T4 → `deep`
- **Wave 2**: **3** — T5 → `deep`, T6 → `deep`, T7 → `unspecified-high`
- **Wave 3**: **1** — T8 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Install kafkajs + shared Kafka client module + compose config

  **What to do**:
  - Install `kafkajs` in `packages/service-utils` (`pnpm --filter @script-manifest/service-utils add kafkajs`)
  - Create `packages/service-utils/src/kafka.ts` — shared Kafka client factory:
    ```typescript
    import { Kafka, type Producer, type Consumer } from "kafkajs";
    
    let kafka: Kafka | null = null;
    
    export function getKafkaClient(): Kafka | null {
      const brokers = process.env.KAFKA_BROKERS;
      if (!brokers) return null;
      if (!kafka) {
        kafka = new Kafka({
          clientId: "script-manifest",
          brokers: brokers.split(","),
          retry: { retries: 3 },
        });
      }
      return kafka;
    }
    
    export type { Producer, Consumer };
    ```
  - Export from `packages/service-utils/src/index.ts`: `export { getKafkaClient } from "./kafka.js"`
  - Add `--set auto_create_topics_enabled=true` to Redpanda command in `compose.yml` AND `compose.prod.yml`
  - Add `depends_on: redpanda` to notification-service in both compose files
  - Write test: `packages/service-utils/test/kafka.test.ts`
    - Test: `getKafkaClient()` returns `null` when `KAFKA_BROKERS` not set
    - Test: `getKafkaClient()` returns a `Kafka` instance when `KAFKA_BROKERS` is set
    - Test: multiple calls return same instance (singleton)

  **Must NOT do**:
  - Do NOT create Kafka topics programmatically — Redpanda auto-creates
  - Do NOT add schema registry or Avro dependencies
  - Do NOT modify any service code beyond service-utils + compose files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Package install, small utility module, compose config edits
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/service-utils/src/notificationPublisher.ts` — Current publisher pattern to understand the module structure
  - `packages/service-utils/src/index.ts:9` — Where to add the new export

  **API/Type References**:
  - `kafkajs` npm package — Kafka, Producer, Consumer types

  **External References**:
  - kafkajs docs: https://kafka.js.org/docs/getting-started

  **WHY Each Reference Matters**:
  - `notificationPublisher.ts`: Shows the module pattern and naming convention in service-utils
  - `index.ts:9`: Shows exactly where exports are listed — add new export in same style

  **Acceptance Criteria**:
  - [ ] `kafkajs` in `packages/service-utils/package.json` dependencies
  - [ ] `packages/service-utils/src/kafka.ts` exists and exports `getKafkaClient`
  - [ ] `packages/service-utils/src/index.ts` re-exports `getKafkaClient`
  - [ ] `compose.yml` and `compose.prod.yml` have `--set auto_create_topics_enabled=true` in redpanda command
  - [ ] `node --import tsx --test packages/service-utils/test/kafka.test.ts` → PASS (3 tests)
  - [ ] `pnpm --filter @script-manifest/service-utils typecheck` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Kafka client returns null when KAFKA_BROKERS unset
    Tool: Bash (node --test)
    Preconditions: KAFKA_BROKERS env var NOT set
    Steps:
      1. Run: node --import tsx --test packages/service-utils/test/kafka.test.ts
      2. Assert: test "returns null when KAFKA_BROKERS not set" passes
    Expected Result: Test passes, getKafkaClient() returns null
    Failure Indicators: Test fails, function throws instead of returning null
    Evidence: .sisyphus/evidence/task-1-kafka-client-null.txt

  Scenario: Kafka client returns instance when KAFKA_BROKERS set
    Tool: Bash (node --test)
    Preconditions: KAFKA_BROKERS=localhost:9092
    Steps:
      1. Run: KAFKA_BROKERS=localhost:9092 node --import tsx --test packages/service-utils/test/kafka.test.ts
      2. Assert: test "returns Kafka instance when KAFKA_BROKERS set" passes
    Expected Result: Test passes, getKafkaClient() returns Kafka instance
    Failure Indicators: Test fails or import error
    Evidence: .sisyphus/evidence/task-1-kafka-client-instance.txt

  Scenario: Compose config has topic auto-creation
    Tool: Bash (grep)
    Preconditions: compose.yml and compose.prod.yml exist
    Steps:
      1. Run: grep -c 'auto_create_topics_enabled=true' compose.yml
      2. Run: grep -c 'auto_create_topics_enabled=true' compose.prod.yml
    Expected Result: Both return 1 (flag present in both files)
    Failure Indicators: grep returns 0 — flag missing
    Evidence: .sisyphus/evidence/task-1-compose-config.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-kafka-client-null.txt — test output
  - [ ] task-1-kafka-client-instance.txt — test output
  - [ ] task-1-compose-config.txt — grep output

  **Commit**: YES
  - Message: `feat(service-utils): add kafkajs dependency and shared Kafka client module`
  - Files: `packages/service-utils/src/kafka.ts`, `packages/service-utils/src/index.ts`, `packages/service-utils/package.json`, `packages/service-utils/test/kafka.test.ts`, `compose.yml`, `compose.prod.yml`, `pnpm-lock.yaml`
  - Pre-commit: `pnpm --filter @script-manifest/service-utils typecheck && node --import tsx --test packages/service-utils/test/kafka.test.ts`

- [x] 2. TDD: Extract SLA scheduler to scheduler.ts (CHAOS-604)

  **What to do**:
  - **RED phase**: Create `services/coverage-marketplace-service/src/scheduler.test.ts`:
    - Test: `createScheduler` returns an object with `start()`, `stop()`, `runOnce()` methods
    - Test: `runOnce()` calls repository.listOrders for delivered orders past auto-complete cutoff
    - Test: `runOnce()` calls repository.listOrders for claimed/in_progress orders past SLA deadline
    - Test: `start()` begins interval, `stop()` clears it
    - Test: `runOnce()` catches and logs errors without crashing (preserve existing behavior)
    - Use a mock repository and mock paymentGateway matching existing test patterns
  - **GREEN phase**: Create `services/coverage-marketplace-service/src/scheduler.ts`:
    - Export `createScheduler(deps)` factory function:
      ```typescript
      export interface SchedulerDeps {
        repository: CoverageMarketplaceRepository;
        paymentGateway: PaymentGateway;
        autoCompleteDays: number;
        systemUserId: string;
        logger: FastifyBaseLogger;
      }
      
      export function createScheduler(deps: SchedulerDeps) {
        let timer: ReturnType<typeof setInterval> | null = null;
        
        async function runOnce(): Promise<void> { /* moved from index.ts:98-155 */ }
        
        function start(intervalMs: number): void { /* setInterval wrapper */ }
        function stop(): void { /* clearInterval */ }
        
        return { start, stop, runOnce };
      }
      ```
    - Move `runSlaMaintenance` logic (lines 98-155) into `runOnce()` — exact same logic, just receiving deps as params instead of closures
  - **REFACTOR phase**: Update `index.ts`:
    - Import `createScheduler` from `./scheduler.js`
    - In `buildServer()`: create scheduler instance, wire into `onReady` hook (call `scheduler.start(maintenanceIntervalMs)`) and `onClose` hook (call `scheduler.stop()`)
    - Remove the inline `runSlaMaintenance` function (lines 98-155)
    - Remove the inline `setInterval`/`clearInterval` code (lines 161-176)
    - Update `POST /internal/jobs/sla-maintenance` to call `scheduler.runOnce()` instead of `runSlaMaintenance(authUserId)`
    - Keep all env var reading (`autoCompleteDays`, `maintenanceIntervalMs`, `systemUserId`) in `index.ts` — pass to scheduler factory
  - Run existing tests to verify no regressions: `node --import tsx --test services/coverage-marketplace-service/src/index.test.ts`

  **Must NOT do**:
  - Do NOT change SLA business logic (auto-complete thresholds, dispute creation, etc.)
  - Do NOT add cron library, job persistence, or job framework
  - Do NOT fix the per-order error handling bug (file CHAOS-xxx follow-up issue instead)
  - Do NOT change POST `/internal/jobs/sla-maintenance` endpoint behavior — it must still work
  - Do NOT change env var names or defaults

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Refactoring with behavior preservation, TDD, DI pattern, multiple file coordination
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work
    - `git-master`: Standard commit, no complex git ops

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `services/coverage-marketplace-service/src/index.ts:98-155` — The `runSlaMaintenance` function to extract (exact source code)
  - `services/coverage-marketplace-service/src/index.ts:158-176` — The `onReady`/`onClose` hooks with setInterval/clearInterval
  - `services/coverage-marketplace-service/src/index.ts:1088-1097` — The POST `/internal/jobs/sla-maintenance` endpoint that calls runSlaMaintenance
  - `services/coverage-marketplace-service/src/index.ts:86-89` — Config vars (`autoCompleteDays`, `maintenanceIntervalMs`, `systemUserId`, `maintenanceTimer`)

  **API/Type References**:
  - `services/coverage-marketplace-service/src/index.ts:buildServer` — The function containing all closure dependencies
  - Repository type: `PgCoverageMarketplaceRepository` — methods used: `listOrders`, `getProvider`, `updateOrderStatus`, `getDisputeByOrder`, `createDispute`, `createDisputeEvent`
  - PaymentGateway: `capturePayment`, `transferToProvider` methods

  **Test References**:
  - `services/coverage-marketplace-service/src/index.test.ts` — Existing test patterns (server.inject, mock setup)

  **WHY Each Reference Matters**:
  - `index.ts:98-155`: This is the EXACT code to move — copy it verbatim, changing only closure refs to deps params
  - `index.ts:158-176`: Shows how interval is started/stopped — must be replicated in scheduler.start/stop
  - `index.ts:1088-1097`: This endpoint must continue working after extraction — verify it calls scheduler.runOnce()
  - `index.test.ts`: Follow same test patterns (mock creation, server.inject style)

  **Acceptance Criteria**:
  - [ ] `services/coverage-marketplace-service/src/scheduler.ts` exists and exports `createScheduler`
  - [ ] `services/coverage-marketplace-service/src/scheduler.test.ts` exists
  - [ ] `node --import tsx --test services/coverage-marketplace-service/src/scheduler.test.ts` → PASS (5+ tests)
  - [ ] `node --import tsx --test services/coverage-marketplace-service/src/index.test.ts` → PASS (existing tests)
  - [ ] `pnpm --filter @script-manifest/coverage-marketplace-service typecheck` → PASS
  - [ ] `runSlaMaintenance` function no longer defined inline in `index.ts`
  - [ ] `setInterval` for SLA no longer directly in `index.ts` onReady hook

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scheduler module exports correct API
    Tool: Bash (node --test)
    Preconditions: scheduler.ts and scheduler.test.ts created
    Steps:
      1. Run: node --import tsx --test services/coverage-marketplace-service/src/scheduler.test.ts
      2. Assert: all tests pass (createScheduler returns {start, stop, runOnce})
    Expected Result: 5+ tests pass, 0 failures
    Failure Indicators: Import error, missing exports, test failures
    Evidence: .sisyphus/evidence/task-2-scheduler-tests.txt

  Scenario: Existing coverage-marketplace tests still pass
    Tool: Bash (node --test)
    Preconditions: scheduler extracted, index.ts updated
    Steps:
      1. Run: node --import tsx --test services/coverage-marketplace-service/src/index.test.ts
      2. Assert: all existing tests pass
    Expected Result: Same test count, 0 failures (no regressions)
    Failure Indicators: Any test failure = regression in extraction
    Evidence: .sisyphus/evidence/task-2-existing-tests.txt

  Scenario: Inline runSlaMaintenance removed from index.ts
    Tool: Bash (grep)
    Preconditions: extraction complete
    Steps:
      1. Run: grep -n 'async function runSlaMaintenance' services/coverage-marketplace-service/src/index.ts
      2. Assert: no matches (function moved to scheduler.ts)
      3. Run: grep -n 'runSlaMaintenance\|createScheduler' services/coverage-marketplace-service/src/index.ts
      4. Assert: only import and usage references remain (no definition)
    Expected Result: grep returns 0 matches for function definition, shows import from ./scheduler
    Failure Indicators: Function still defined inline
    Evidence: .sisyphus/evidence/task-2-extraction-verified.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-scheduler-tests.txt — new scheduler test output
  - [ ] task-2-existing-tests.txt — existing test output (regression check)
  - [ ] task-2-extraction-verified.txt — grep output confirming extraction

  **Commit**: YES
  - Message: `refactor(coverage-marketplace): extract SLA scheduler to dedicated module (CHAOS-604)`
  - Files: `services/coverage-marketplace-service/src/scheduler.ts`, `services/coverage-marketplace-service/src/scheduler.test.ts`, `services/coverage-marketplace-service/src/index.ts`
  - Pre-commit: `node --import tsx --test services/coverage-marketplace-service/src/scheduler.test.ts && node --import tsx --test services/coverage-marketplace-service/src/index.test.ts`

- [x] 3. TDD: Create AuthBanner.tsx + convert home page to RSC (CHAOS-605)

  **What to do**:
  - **RED phase**: Create test file `apps/writer-web/app/components/AuthBanner.test.tsx`:
    - Test: AuthBanner renders null initially (no flash of wrong content during hydration)
    - Test: AuthBanner renders welcome-back UI when session is available
    - Test: AuthBanner renders unauthenticated CTA when no session
    - Test: AuthBanner subscribes to SESSION_CHANGED_EVENT and storage events
  - **GREEN phase**: Create `apps/writer-web/app/components/AuthBanner.tsx`:
    ```tsx
    "use client";
    import { useState, useEffect } from "react";
    // Move ALL auth-related code from page.tsx:
    // - readStoredSession() / syncSession logic
    // - useState for user
    // - useEffect for SESSION_CHANGED_EVENT + storage event listeners
    // - Conditional render: authenticated welcome vs unauthenticated hero CTA
    // IMPORTANT: Render null on first paint to avoid hydration mismatch,
    // then update in useEffect after reading localStorage
    ```
  - **REFACTOR phase**: Convert `apps/writer-web/app/page.tsx` to RSC:
    - Remove `"use client"` directive from line 1
    - Remove `useState`, `useEffect` imports
    - Remove all auth-related code (moved to AuthBanner)
    - Keep `writerSurfaces` and `trustPrinciples` static arrays in server component
    - Import and render `<AuthBanner />` as a client island
    - Keep all static UI (hero section, feature cards, trust principles) in server component
    - Verify `HeroIllustration` and `TrustIllustration` are compatible with RSC (pure SVG, no hooks) — if they use client features, add `"use client"` to their files
  - Verify build succeeds: `pnpm --filter @script-manifest/writer-web build`

  **Must NOT do**:
  - Do NOT change auth mechanism (stays localStorage-based)
  - Do NOT migrate any other pages
  - Do NOT add server-side auth (cookies, middleware auth checks)
  - Do NOT add Suspense boundaries or streaming patterns
  - Do NOT change the visual output (same layout, same content)
  - Keep `writerSurfaces` and `trustPrinciples` in the server component file
  - Do NOT import `readStoredSession` or any auth utils in the server component

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: React RSC migration with TDD, hydration concerns, component splitting
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Could use for visual testing but build verification is sufficient
    - `frontend-ui-ux`: No new design work, pure refactoring

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `apps/writer-web/app/page.tsx` — The ENTIRE current home page to split (read all of it)
  - `apps/writer-web/app/lib/authSession.ts` — Auth session utilities (`readStoredSession`, `SESSION_CHANGED_EVENT`)
  - `apps/writer-web/app/components/illustrations.tsx` — Check if HeroIllustration/TrustIllustration use hooks (if so, need "use client")

  **API/Type References**:
  - React RSC: Server Components cannot use `useState`, `useEffect`, `window`, `localStorage`
  - Client components need `"use client"` directive

  **Test References**:
  - Existing writer-web test patterns in `apps/writer-web/` (if any exist)

  **WHY Each Reference Matters**:
  - `page.tsx`: Contains ALL the code to split — must read every line to decide what stays (static) vs moves (auth)
  - `authSession.ts`: AuthBanner will import these utils — need to understand their API
  - `illustrations.tsx`: Must verify RSC compatibility — if they use hooks, they need to be client components too

  **Acceptance Criteria**:
  - [ ] `apps/writer-web/app/components/AuthBanner.tsx` exists with `"use client"` directive
  - [ ] `apps/writer-web/app/page.tsx` does NOT contain `"use client"`
  - [ ] `apps/writer-web/app/page.tsx` does NOT import `useState` or `useEffect`
  - [ ] `writerSurfaces` and `trustPrinciples` are in `page.tsx` (server component)
  - [ ] `pnpm --filter @script-manifest/writer-web build` — PASS
  - [ ] `pnpm --filter @script-manifest/writer-web typecheck` — PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: page.tsx is a valid RSC (no client directives or hooks)
    Tool: Bash (grep)
    Preconditions: page.tsx converted to RSC
    Steps:
      1. Run: grep -c '"use client"' apps/writer-web/app/page.tsx
      2. Assert: returns 0 (no "use client" directive)
      3. Run: grep -c 'useState\|useEffect' apps/writer-web/app/page.tsx
      4. Assert: returns 0 (no hooks in server component)
      5. Run: grep -c 'writerSurfaces' apps/writer-web/app/page.tsx
      6. Assert: returns >= 1 (static data still in server component)
    Expected Result: page.tsx has no client features, keeps static data
    Failure Indicators: grep returns non-zero for client features
    Evidence: .sisyphus/evidence/task-3-rsc-verified.txt

  Scenario: AuthBanner.tsx is a valid client component
    Tool: Bash (grep + head)
    Preconditions: AuthBanner.tsx created
    Steps:
      1. Run: head -1 apps/writer-web/app/components/AuthBanner.tsx
      2. Assert: first line is '"use client"'
      3. Run: grep -c 'useState\|useEffect' apps/writer-web/app/components/AuthBanner.tsx
      4. Assert: returns >= 1 (hooks are in client component)
    Expected Result: AuthBanner has "use client" and uses React hooks
    Failure Indicators: Missing directive or hooks
    Evidence: .sisyphus/evidence/task-3-authbanner-verified.txt

  Scenario: writer-web builds successfully
    Tool: Bash (pnpm build)
    Preconditions: All changes complete
    Steps:
      1. Run: pnpm --filter @script-manifest/writer-web build
      2. Assert: exit code 0, no RSC compilation errors
    Expected Result: Build succeeds (RSC/client boundary correct)
    Failure Indicators: Build error about server/client boundary violation
    Evidence: .sisyphus/evidence/task-3-build-success.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-rsc-verified.txt — grep output confirming RSC conversion
  - [ ] task-3-authbanner-verified.txt — grep output confirming client component
  - [ ] task-3-build-success.txt — build output

  **Commit**: YES
  - Message: `refactor(writer-web): split home page into RSC shell + AuthBanner client component (CHAOS-605)`
  - Files: `apps/writer-web/app/page.tsx`, `apps/writer-web/app/components/AuthBanner.tsx`, `apps/writer-web/app/components/AuthBanner.test.tsx`
  - Pre-commit: `pnpm --filter @script-manifest/writer-web build && pnpm --filter @script-manifest/writer-web typecheck`

- [x] 4. Audit all Next.js API routes + document findings (CHAOS-606, part 1)

  **What to do**:
  - Scan all files in `apps/writer-web/app/api/` recursively
  - For each route file, classify as:
    - **Pure proxy**: Only calls `proxyRequest()` — no other logic
    - **Custom logic**: Has additional code beyond proxying (transforms, auth enrichment, file handling)
    - **Special handling**: Non-standard routes (uploads, webhooks, etc.)
  - Count exact numbers per category
  - Document the `_proxy.ts` implementation (what headers it forwards, what it strips)
  - Document CORS configuration on the API gateway
  - Assess: if all pure proxies were removed, what would break? (cookie concerns, error handling UX)
  - Write recommendation: remove, keep, or partial removal
  - Create `docs/phase-5/proxy-layer-audit.md` with:
    - Executive summary
    - Route classification table (file path, category, notes)
    - Current architecture diagram (browser → Next.js → gateway → service)
    - Proposed architecture (browser → gateway → service)
    - Risk assessment
    - Recommendation with rationale
    - Migration plan (if recommending removal)

  **Must NOT do**:
  - Do NOT remove any existing proxy routes
  - Do NOT modify the API gateway
  - Do NOT change CORS configuration
  - Do NOT modify any route files
  - Output is documentation ONLY

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading ~80 route files, analyzing patterns, producing structured documentation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work for audit phase

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `apps/writer-web/app/api/v1/_proxy.ts` — The proxy utility (63 lines) — read every line
  - `apps/writer-web/app/api/v1/projects/route.ts` — Representative pure proxy route
  - `apps/writer-web/app/api/v1/auth/me/route.ts` — Another representative route
  - `apps/writer-web/app/api/v1/scripts/upload/route.ts` — Known custom logic route
  - `apps/writer-web/app/api/v1/bug-report/route.ts` — Known custom logic route (Linear SDK)

  **API/Type References**:
  - `services/api-gateway/src/index.ts` — CORS configuration (allowed origins, headers, methods)

  **WHY Each Reference Matters**:
  - `_proxy.ts`: The core utility — understanding what it forwards/strips is essential for the audit
  - Representative routes: Confirm the "pure proxy" pattern
  - Custom logic routes: These are the exceptions that must be documented
  - Gateway CORS: Determines feasibility of direct browser-to-gateway calls

  **Acceptance Criteria**:
  - [ ] `docs/phase-5/proxy-layer-audit.md` exists
  - [ ] Document contains route classification table with ALL routes
  - [ ] Document includes CORS assessment
  - [ ] Document includes recommendation (remove/keep/partial)
  - [ ] `wc -l docs/phase-5/proxy-layer-audit.md` returns >= 50 lines (substantive document)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Audit document exists and is substantive
    Tool: Bash (test + wc)
    Preconditions: Audit complete
    Steps:
      1. Run: test -f docs/phase-5/proxy-layer-audit.md && echo "EXISTS"
      2. Assert: output is "EXISTS"
      3. Run: wc -l docs/phase-5/proxy-layer-audit.md
      4. Assert: >= 50 lines
      5. Run: grep -c '| Pure proxy' docs/phase-5/proxy-layer-audit.md
      6. Assert: >= 1 (classification table present)
    Expected Result: Document exists with >= 50 lines and route classification
    Failure Indicators: File missing, too short, or no classification table
    Evidence: .sisyphus/evidence/task-4-audit-exists.txt

  Scenario: All route files accounted for in audit
    Tool: Bash (find + grep)
    Preconditions: Audit document complete
    Steps:
      1. Run: find apps/writer-web/app/api -name 'route.ts' | wc -l
      2. Capture count as TOTAL_ROUTES
      3. Run: grep -c 'route.ts' docs/phase-5/proxy-layer-audit.md
      4. Assert: count >= TOTAL_ROUTES (every route mentioned)
    Expected Result: Audit covers all route files
    Failure Indicators: Routes missing from audit
    Evidence: .sisyphus/evidence/task-4-route-coverage.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-audit-exists.txt — document stats
  - [ ] task-4-route-coverage.txt — route coverage verification

  **Commit**: YES (groups with Task 7)
  - Message: `docs(phase-5): proxy layer audit and POC direct gateway call (CHAOS-606)`
  - Files: `docs/phase-5/proxy-layer-audit.md`
  - Pre-commit: `test -f docs/phase-5/proxy-layer-audit.md`

- [x] 5. TDD: Kafka producer in service-utils (CHAOS-603, producer side)

  **What to do**:
  - **RED phase**: Create `packages/service-utils/test/notificationPublisher.test.ts`:
    - Test: when `KAFKA_BROKERS` is set, `publishNotificationEvent` sends message to Kafka topic `notification-events` with key=`targetUserId` and value=JSON-serialized event
    - Test: when `KAFKA_BROKERS` is NOT set, falls back to HTTP POST (existing behavior)
    - Test: validates event with `NotificationEventEnvelopeSchema` before sending (both paths)
    - Test: Kafka producer connects lazily on first publish (not at import time)
    - Test: Kafka send failure throws with descriptive error message
    - Mock kafkajs `Producer` and `undici.request` for unit tests
  - **GREEN phase**: Update `packages/service-utils/src/notificationPublisher.ts`:
    ```typescript
    import { getKafkaClient } from "./kafka.js";
    import type { Producer } from "kafkajs";
    
    let producer: Producer | null = null;
    
    export async function publishNotificationEvent(event: NotificationEventEnvelope): Promise<void> {
      const validatedEvent = NotificationEventEnvelopeSchema.parse(event);
      const kafka = getKafkaClient();
      
      if (kafka) {
        // Kafka path
        if (!producer) {
          producer = kafka.producer();
          await producer.connect();
        }
        await producer.send({
          topic: "notification-events",
          messages: [{ key: validatedEvent.targetUserId, value: JSON.stringify(validatedEvent) }],
        });
      } else {
        // HTTP fallback (existing behavior)
        const { request } = await import("undici");
        const response = await request(`${notificationServiceBase}/internal/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validatedEvent),
        });
        // ... existing error handling ...
      }
    }
    ```
  - **CRITICAL**: Producer must connect lazily (first publish), NOT at import/startup. Services must NOT fail to start if Redpanda is down.
  - Preserve the DI pattern in calling services — no changes needed since they use `options.publisher ?? publishNotificationEvent`
  - Add `export async function disconnectProducer()` for graceful shutdown (call in service `onClose` hooks)

  **Must NOT do**:
  - Do NOT change the function signature of `publishNotificationEvent`
  - Do NOT change `NotificationEventEnvelope` schema in contracts
  - Do NOT modify any of the 3 calling services (profile-project, feedback-exchange, ranking)
  - Do NOT add dead letter queue, retry policies beyond kafkajs defaults, or schema registry
  - Do NOT build a generic event bus — this is for notifications only
  - Do NOT remove the HTTP fallback — it must work when KAFKA_BROKERS is not set

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Kafka integration with fallback logic, TDD, lazy connection, error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (needs kafkajs installed + kafka.ts module)

  **References**:

  **Pattern References**:
  - `packages/service-utils/src/notificationPublisher.ts` — The EXACT file to modify (23 lines, read all)
  - `packages/service-utils/src/kafka.ts` — The shared Kafka client (created in Task 1) — use `getKafkaClient()`
  - `services/profile-project-service/src/index.ts:41` — DI pattern: `const publisher = options.publisher ?? publishNotificationEvent` — verify this still works

  **API/Type References**:
  - `@script-manifest/contracts` — `NotificationEventEnvelope`, `NotificationEventEnvelopeSchema`
  - kafkajs Producer API: `producer.connect()`, `producer.send({ topic, messages: [{ key, value }] })`
  - `undici.request` — existing HTTP client used for fallback

  **Test References**:
  - `packages/service-utils/test/env.test.ts` — Test pattern for service-utils tests

  **WHY Each Reference Matters**:
  - `notificationPublisher.ts`: This is the file being modified — must understand current 23-line implementation exactly
  - `kafka.ts`: The `getKafkaClient()` function returns null when KAFKA_BROKERS is unset — this drives the fallback logic
  - `profile-project-service/src/index.ts:41`: Confirms DI pattern — no calling service changes needed

  **Acceptance Criteria**:
  - [ ] `publishNotificationEvent` uses Kafka when `KAFKA_BROKERS` is set
  - [ ] `publishNotificationEvent` falls back to HTTP when `KAFKA_BROKERS` is not set
  - [ ] Producer connects lazily (first call, not at import)
  - [ ] `disconnectProducer()` export exists for graceful shutdown
  - [ ] `KAFKA_BROKERS=localhost:9092 node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts` → PASS
  - [ ] `node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts` → PASS (HTTP fallback)
  - [ ] `pnpm --filter @script-manifest/service-utils typecheck` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Kafka producer path works when KAFKA_BROKERS set
    Tool: Bash (node --test)
    Preconditions: kafkajs installed, kafka.ts exists, KAFKA_BROKERS set
    Steps:
      1. Run: KAFKA_BROKERS=localhost:9092 node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts
      2. Assert: Kafka-path tests pass (producer.send called with correct topic and message)
    Expected Result: All Kafka-path tests pass
    Failure Indicators: Test failure, import error, producer not called
    Evidence: .sisyphus/evidence/task-5-kafka-producer.txt

  Scenario: HTTP fallback works when KAFKA_BROKERS not set
    Tool: Bash (node --test)
    Preconditions: KAFKA_BROKERS NOT set
    Steps:
      1. Run: node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts
      2. Assert: HTTP-path tests pass (undici.request called)
    Expected Result: All HTTP-fallback tests pass
    Failure Indicators: Test tries Kafka instead of HTTP
    Evidence: .sisyphus/evidence/task-5-http-fallback.txt

  Scenario: Lazy connection verified
    Tool: Bash (node --test)
    Preconditions: Test specifically checks producer.connect timing
    Steps:
      1. Assert: producer.connect() NOT called at import time
      2. Assert: producer.connect() called on first publishNotificationEvent() call
    Expected Result: Lazy connection test passes
    Failure Indicators: producer.connect() called during module load
    Evidence: .sisyphus/evidence/task-5-lazy-connection.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-kafka-producer.txt — Kafka path test output
  - [ ] task-5-http-fallback.txt — HTTP fallback test output
  - [ ] task-5-lazy-connection.txt — lazy connection test output

  **Commit**: YES
  - Message: `feat(service-utils): replace HTTP notification publisher with Kafka producer (CHAOS-603)`
  - Files: `packages/service-utils/src/notificationPublisher.ts`, `packages/service-utils/test/notificationPublisher.test.ts`
  - Pre-commit: `KAFKA_BROKERS=localhost:9092 node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts && node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts`

- [x] 6. TDD: Kafka consumer in notification-service (CHAOS-603, consumer side)

  **What to do**:
  - **RED phase**: Create `services/notification-service/src/consumer.test.ts`:
    - Test: consumer subscribes to `notification-events` topic with group ID `notification-service`
    - Test: on message received, parses JSON and calls `repository.pushEvent(event)`
    - Test: invalid JSON messages are logged and skipped (not crash)
    - Test: `startConsumer()` returns a function to disconnect
    - Mock kafkajs Consumer and repository
  - **GREEN phase**: Create `services/notification-service/src/consumer.ts`:
    ```typescript
    import { getKafkaClient } from "@script-manifest/service-utils";
    import { NotificationEventEnvelopeSchema } from "@script-manifest/contracts";
    import type { NotificationRepository } from "./repository.js";
    
    export async function startConsumer(repository: NotificationRepository, logger: FastifyBaseLogger): Promise<() => Promise<void>> {
      const kafka = getKafkaClient();
      if (!kafka) {
        logger.warn("KAFKA_BROKERS not set — Kafka consumer disabled, events accepted via HTTP only");
        return async () => {};
      }
      const consumer = kafka.consumer({ groupId: "notification-service" });
      await consumer.connect();
      await consumer.subscribe({ topic: "notification-events", fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const event = NotificationEventEnvelopeSchema.parse(JSON.parse(message.value!.toString()));
            await repository.pushEvent(event);
          } catch (err) {
            logger.error({ err, offset: message.offset }, "failed to process notification event");
          }
        },
      });
      return async () => { await consumer.disconnect(); };
    }
    ```
  - **REFACTOR phase**: Wire consumer into `services/notification-service/src/index.ts`:
    - Import `startConsumer` from `./consumer.js`
    - In `onReady` hook: `const stopConsumer = await startConsumer(repository, server.log);`
    - In `onClose` hook: `await stopConsumer();`
    - Keep existing `POST /internal/events` endpoint as HTTP fallback
  - Run existing tests: `node --import tsx --test services/notification-service/src/index.test.ts`

  **Must NOT do**:
  - Do NOT remove the `POST /internal/events` HTTP endpoint
  - Do NOT add dead letter queue
  - Do NOT change the `NotificationEventEnvelope` schema
  - Do NOT add deduplication logic (follow-up issue if needed)
  - Do NOT make the consumer block service startup — if Kafka is unavailable, log warning and continue with HTTP-only mode

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Kafka consumer integration, TDD, error handling, graceful degradation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (needs kafkajs installed + kafka.ts module)

  **References**:

  **Pattern References**:
  - `services/notification-service/src/index.ts` — The service to wire consumer into (122 lines, read all)
  - `services/notification-service/src/index.ts:28-30` — `onReady` hook where consumer should start
  - `services/notification-service/src/index.ts:32-34` — `onClose` hook where consumer should stop
  - `services/notification-service/src/index.ts:74-85` — Existing POST /internal/events handler (keep as-is)
  - `services/notification-service/src/repository.ts` — `NotificationRepository` interface (use `pushEvent` method)
  - `services/notification-service/src/pgRepository.ts` — PostgreSQL implementation of repository

  **API/Type References**:
  - kafkajs Consumer API: `consumer.connect()`, `consumer.subscribe()`, `consumer.run({ eachMessage })`, `consumer.disconnect()`
  - `@script-manifest/contracts` — `NotificationEventEnvelopeSchema` for validation
  - `@script-manifest/service-utils` — `getKafkaClient()` for shared Kafka instance

  **WHY Each Reference Matters**:
  - `index.ts:28-30, 32-34`: Exact hooks to wire consumer start/stop into
  - `index.ts:74-85`: Must NOT be modified — HTTP endpoint stays as fallback
  - `repository.ts`: Consumer calls `repository.pushEvent()` — same method as HTTP handler

  **Acceptance Criteria**:
  - [ ] `services/notification-service/src/consumer.ts` exists and exports `startConsumer`
  - [ ] `services/notification-service/src/consumer.test.ts` exists
  - [ ] `node --import tsx --test services/notification-service/src/consumer.test.ts` → PASS (4+ tests)
  - [ ] `node --import tsx --test services/notification-service/src/index.test.ts` → PASS (existing tests)
  - [ ] `POST /internal/events` HTTP endpoint still works (verified by existing tests)
  - [ ] `pnpm --filter @script-manifest/notification-service typecheck` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Consumer processes messages and persists to repository
    Tool: Bash (node --test)
    Preconditions: consumer.ts and consumer.test.ts created
    Steps:
      1. Run: node --import tsx --test services/notification-service/src/consumer.test.ts
      2. Assert: test "processes valid message and calls pushEvent" passes
    Expected Result: Consumer parses message, validates schema, calls repository.pushEvent
    Failure Indicators: pushEvent not called, schema validation error
    Evidence: .sisyphus/evidence/task-6-consumer-tests.txt

  Scenario: Consumer handles invalid messages gracefully
    Tool: Bash (node --test)
    Preconditions: consumer.test.ts has invalid message test
    Steps:
      1. Assert: test "logs error and skips invalid JSON" passes
      2. Assert: consumer does NOT crash on bad messages
    Expected Result: Error logged, message skipped, consumer continues
    Failure Indicators: Consumer throws/crashes on invalid message
    Evidence: .sisyphus/evidence/task-6-error-handling.txt

  Scenario: Existing notification-service tests still pass
    Tool: Bash (node --test)
    Preconditions: consumer wired into index.ts
    Steps:
      1. Run: node --import tsx --test services/notification-service/src/index.test.ts
      2. Assert: all existing tests pass (HTTP endpoint still works)
    Expected Result: Same test count, 0 failures
    Failure Indicators: Any test failure = regression
    Evidence: .sisyphus/evidence/task-6-existing-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-consumer-tests.txt — new consumer test output
  - [ ] task-6-error-handling.txt — error handling test output
  - [ ] task-6-existing-tests.txt — existing tests regression check

  **Commit**: YES
  - Message: `feat(notification-service): add Kafka consumer for event ingestion (CHAOS-603)`
  - Files: `services/notification-service/src/consumer.ts`, `services/notification-service/src/consumer.test.ts`, `services/notification-service/src/index.ts`
  - Pre-commit: `node --import tsx --test services/notification-service/src/consumer.test.ts && node --import tsx --test services/notification-service/src/index.test.ts`

- [x] 7. POC: Direct browser-to-gateway route (CHAOS-606, part 2)

  **What to do**:
  - Select 1 representative pure-proxy route from the audit (Task 4) — choose an authenticated JSON endpoint (e.g., `GET /api/v1/projects`)
  - Create a POC demonstrating direct browser-to-gateway call:
    - Option A: Create a small test page or script that calls the gateway directly (bypass Next.js proxy)
    - Option B: Modify the frontend API client for just that 1 route to call `API_GATEWAY_URL` directly
  - Document the POC in the audit document (append to `docs/phase-5/proxy-layer-audit.md`):
    - What was changed
    - Results (latency comparison if possible, any CORS issues, error handling differences)
    - Recommendation for full migration
  - Verify CORS works: browser can call gateway directly with Authorization header
  - Note any UX differences (error handling when gateway is down vs proxy is down)

  **Must NOT do**:
  - Do NOT remove any existing proxy routes
  - Do NOT modify more than 1 route for the POC
  - Do NOT modify the API gateway CORS config
  - Do NOT change the auth flow
  - The POC is proof of concept — not production-ready migration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Investigation + POC implementation, needs to understand both frontend and backend
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 4 (needs audit to select the right route)

  **References**:

  **Pattern References**:
  - `docs/phase-5/proxy-layer-audit.md` — The audit document from Task 4 (append POC results)
  - `apps/writer-web/app/api/v1/_proxy.ts` — The proxy utility being bypassed
  - Selected route file (determined by Task 4 audit)

  **API/Type References**:
  - `services/api-gateway/src/index.ts` — CORS config, endpoint routing
  - `API_GATEWAY_URL` env var (default `http://localhost:4000`)

  **WHY Each Reference Matters**:
  - `proxy-layer-audit.md`: POC results should be appended to this document for completeness
  - `_proxy.ts`: Understanding what the POC is replacing
  - Gateway CORS: Must verify browser can call gateway directly

  **Acceptance Criteria**:
  - [ ] 1 route demonstrated working via direct browser-to-gateway call
  - [ ] POC results documented in `docs/phase-5/proxy-layer-audit.md`
  - [ ] CORS verified working for direct calls
  - [ ] No existing proxy routes modified or removed

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Direct gateway call works for POC route
    Tool: Bash (curl)
    Preconditions: Gateway running, CORS configured
    Steps:
      1. Run: curl -s -H "Origin: http://localhost:3000" -H "Authorization: Bearer <test-token>" http://localhost:4000/api/v1/<selected-route>
      2. Assert: response status is 200 (not CORS error)
      3. Assert: response body matches expected JSON structure
      4. Assert: response headers include Access-Control-Allow-Origin
    Expected Result: Direct call succeeds, CORS headers present
    Failure Indicators: CORS error (403/0), missing ACAO header
    Evidence: .sisyphus/evidence/task-7-direct-call.txt

  Scenario: POC documented in audit file
    Tool: Bash (grep)
    Preconditions: POC complete, audit updated
    Steps:
      1. Run: grep -c 'POC\|Proof of Concept\|Direct Call' docs/phase-5/proxy-layer-audit.md
      2. Assert: >= 1 (POC section exists)
    Expected Result: Audit document has POC section
    Failure Indicators: No POC section found
    Evidence: .sisyphus/evidence/task-7-poc-documented.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-direct-call.txt — curl output with CORS headers
  - [ ] task-7-poc-documented.txt — grep output confirming POC section

  **Commit**: YES (groups with Task 4)
  - Message: `docs(phase-5): proxy layer audit and POC direct gateway call (CHAOS-606)`
  - Files: `docs/phase-5/proxy-layer-audit.md`, POC test files
  - Pre-commit: `test -f docs/phase-5/proxy-layer-audit.md`

- [x] 8. Full workspace verification + Linear updates

  **What to do**:
  - Run full workspace typecheck: `pnpm typecheck` (must be 18/18)
  - Run full workspace tests: `pnpm test` (all must pass)
  - Verify each sub-issue acceptance criteria:
    - CHAOS-603: Kafka producer + consumer + HTTP fallback working
    - CHAOS-604: Scheduler extracted, existing tests pass
    - CHAOS-605: page.tsx is RSC, AuthBanner is client, build passes
    - CHAOS-606: Audit document exists with route classification + POC
  - Update all 4 Linear sub-issues (CHAOS-603-606) status to Done
  - Update parent CHAOS-602 status to In Progress (Done after PR merges)
  - Ensure all commits are on the feature branch, push to remote
  - Create PR

  **Must NOT do**:
  - Do NOT push directly to main
  - Do NOT merge — PR needs review

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands, updating Linear, creating PR — no complex logic
  - **Skills**: [`linear`]
    - `linear`: Needed for updating Linear issue statuses

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 2, 3, 5, 6, 7 (all implementation tasks)

  **References**:

  **Pattern References**:
  - Previous PR #245 — follow same PR format and description style

  **WHY Each Reference Matters**:
  - PR #245: Template for PR description format, branch naming, commit style

  **Acceptance Criteria**:
  - [ ] `pnpm typecheck` → 18/18 PASS
  - [ ] `pnpm test` → all tests pass
  - [ ] CHAOS-603, 604, 605, 606 updated to Done in Linear
  - [ ] CHAOS-602 updated to In Progress in Linear
  - [ ] Feature branch pushed to remote
  - [ ] PR created

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full workspace passes
    Tool: Bash (pnpm)
    Preconditions: All implementation complete
    Steps:
      1. Run: pnpm typecheck
      2. Assert: 18/18 packages pass
      3. Run: pnpm test
      4. Assert: all tests pass
    Expected Result: Clean workspace — no type errors, no test failures
    Failure Indicators: Any typecheck or test failure
    Evidence: .sisyphus/evidence/task-8-workspace.txt

  Scenario: Linear issues updated
    Tool: Bash (linear)
    Preconditions: All tasks verified
    Steps:
      1. Run: linear i get CHAOS-603 | grep Status
      2. Assert: Status is Done
      3. Run: linear i get CHAOS-604 | grep Status
      4. Assert: Status is Done
      5. Run: linear i get CHAOS-605 | grep Status
      6. Assert: Status is Done
      7. Run: linear i get CHAOS-606 | grep Status
      8. Assert: Status is Done
    Expected Result: All 4 sub-issues show Done
    Failure Indicators: Any issue not updated
    Evidence: .sisyphus/evidence/task-8-linear.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-workspace.txt — typecheck + test output
  - [ ] task-8-linear.txt — linear status verification

  **Commit**: YES
  - Message: `chore: workspace verification and lockfile update`
  - Files: `pnpm-lock.yaml` (if changed)
  - Pre-commit: `pnpm typecheck && pnpm test`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm typecheck` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(service-utils): add kafkajs dependency and shared Kafka client module` — packages/service-utils/src/kafka.ts, packages/service-utils/package.json, compose.yml, compose.prod.yml
- **T2**: `refactor(coverage-marketplace): extract SLA scheduler to dedicated module (CHAOS-604)` — services/coverage-marketplace-service/src/scheduler.ts, services/coverage-marketplace-service/src/index.ts
- **T3**: `refactor(writer-web): split home page into RSC shell + AuthBanner client component (CHAOS-605)` — apps/writer-web/app/page.tsx, apps/writer-web/app/components/AuthBanner.tsx
- **T4+T7**: `docs(phase-5): proxy layer audit and POC direct gateway call (CHAOS-606)` — docs/phase-5/proxy-layer-audit.md, POC files
- **T5**: `feat(service-utils): replace HTTP notification publisher with Kafka producer (CHAOS-603)` — packages/service-utils/src/notificationPublisher.ts
- **T6**: `feat(notification-service): add Kafka consumer for event ingestion (CHAOS-603)` — services/notification-service/src/consumer.ts, services/notification-service/src/index.ts
- **T8**: `chore: workspace verification and lockfile update` — pnpm-lock.yaml

---

## Success Criteria

### Verification Commands
```bash
pnpm test                    # All tests pass
pnpm typecheck               # 18/18 packages pass
# CHAOS-603
KAFKA_BROKERS=localhost:9092 node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts  # Kafka path
node --import tsx --test packages/service-utils/test/notificationPublisher.test.ts  # HTTP fallback path
node --import tsx --test services/notification-service/src/consumer.test.ts  # Consumer
# CHAOS-604
node --import tsx --test services/coverage-marketplace-service/src/scheduler.test.ts  # Scheduler unit tests
node --import tsx --test services/coverage-marketplace-service/src/index.test.ts  # Existing tests still pass
# CHAOS-605
! grep -q '"use client"' apps/writer-web/app/page.tsx  # page.tsx is RSC
grep -q '"use client"' apps/writer-web/app/components/AuthBanner.tsx  # AuthBanner is client
pnpm --filter @script-manifest/writer-web build  # Build succeeds
# CHAOS-606
test -f docs/phase-5/proxy-layer-audit.md  # Audit document exists
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All 4 Linear sub-issues (CHAOS-603-606) updated to Done
- [ ] Parent CHAOS-602 updated to Done
