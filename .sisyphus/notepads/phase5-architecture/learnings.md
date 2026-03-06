# Phase 5 Architecture — Learnings

## 2026-03-06 Session Start

### Codebase State (from main branch after Phase 7 merge)
- Branch: `feat/CHAOS-602-phase5-architecture`
- Worktree: `/Users/chris/projects/script-manifest-chaos-602`
- Latest main: 6f9bd84 (Phase 7 hardening: CHAOS-618)

### Key Phase 7 Changes That Affect Us
- `BaseMemoryRepository` now in `packages/service-utils/src/testing/BaseMemoryRepository.ts`
  - Provides: `init()`, `healthCheck()`, `createStore<K,V>()`, `createId(prefix)` methods
  - ALL test memory repositories should extend this base class
- compose.yml significantly updated (Redis rate limiting, OpenAPI, fixed DATABASE_URL for migrated services)
- notification-service now has `DATABASE_URL` in compose.yml (Phase 4.5 integration confirmed)

### Redpanda State in compose.yml
- Image: `redpandadata/redpanda:v24.3.1`
- Kafka port: 9092 (internal: `redpanda:9092`, external: `localhost:9092`)
- HTTP proxy: 8082
- Console: `docker.redpanda.com/redpandadata/console:v2.7.2`
- NO `auto_create_topics_enabled=true` yet — Task 1 adds this
- NOT in any service `depends_on` yet — Task 1 adds for notification-service

### Test Framework
- `node --import tsx --test` (node:test built-in)
- `BaseMemoryRepository` base class for all in-memory test repositories
- Pattern: extend `BaseMemoryRepository`, implement service-specific interface

### Key File Locations
- `packages/service-utils/src/notificationPublisher.ts` — 23 lines, undici HTTP POST
- `packages/service-utils/src/index.ts` — exports list (add `getKafkaClient` here)
- `packages/service-utils/src/testing/BaseMemoryRepository.ts` — NEW base class
- `services/coverage-marketplace-service/src/index.ts` — `runSlaMaintenance` at lines 98-155
- `services/notification-service/src/index.ts` — 122 lines, POST /internal/events at line 74
- `apps/writer-web/app/page.tsx` — "use client" line 1, uses useState/useEffect
- `apps/writer-web/app/api/v1/_proxy.ts` — 63 lines, thin pass-through

### Conventions
- DI pattern: `const publisher = options.publisher ?? publishNotificationEvent`
- All services use `buildServer(options)` with injectable dependencies for tests
- Commit format: `feat|refactor|docs|chore(scope): description (CHAOS-NNN)`
- Branch: already on `feat/CHAOS-602-phase5-architecture`

## 2026-03-06 Task 6 — Notification Kafka Consumer

- `services/notification-service/src/consumer.ts` now owns Kafka ingestion with `startConsumer(repository, logger)` and returns an async stop function for lifecycle shutdown.
- `getKafkaClient()` null path is non-blocking: missing `KAFKA_BROKERS` logs a warning and returns a no-op disconnect function so HTTP fallback still works.
- Kafka message handling now mirrors HTTP validation by parsing JSON and validating with `NotificationEventEnvelopeSchema` before `repository.pushEvent(event)`.
- Invalid Kafka messages are isolated to logging (`offset` included), then skipped without crashing consumer execution.
- `buildServer()` stores `stopConsumer` in function scope; `onReady` initializes repository then starts consumer, `onClose` stops consumer then closes DB pool.
