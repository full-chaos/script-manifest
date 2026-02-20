# Script Manifest

Writer-first platform for profiles, scripts, competitions, submissions, peer feedback, and paid coverage.

## Stack

- **Monorepo**: pnpm 9.12, Turborepo 2.x, TypeScript 5.9 strict
- **Backend**: 11 Fastify microservices behind an API gateway
- **Frontend**: Next.js 16 (App Router), React 19.2, Tailwind CSS 3.4
- **Storage**: PostgreSQL 16, OpenSearch 2.17, MinIO, Redpanda (Kafka)
- **Payments**: Stripe Connect (coverage-marketplace-service)

## Commands

```bash
pnpm test                                      # All tests
pnpm typecheck                                 # All typechecks
pnpm dev                                       # Start all services
pnpm --filter @script-manifest/<name> test      # Single package test
pnpm --filter @script-manifest/<name> typecheck # Single package typecheck
```

## Service Map

| Service | Port | Package | Storage |
|---------|------|---------|---------|
| api-gateway | 4000 | @script-manifest/api-gateway | — |
| profile-project | 4001 | @script-manifest/profile-project-service | PostgreSQL |
| competition-directory | 4002 | @script-manifest/competition-directory-service | In-memory |
| search-indexer | 4003 | @script-manifest/search-indexer-service | OpenSearch |
| submission-tracking | 4004 | @script-manifest/submission-tracking-service | In-memory |
| identity | 4005 | @script-manifest/identity-service | PostgreSQL |
| feedback-exchange | 4006 | @script-manifest/feedback-exchange-service | PostgreSQL |
| ranking | 4007 | @script-manifest/ranking-service | PostgreSQL |
| coverage-marketplace | 4008 | @script-manifest/coverage-marketplace-service | PostgreSQL+Stripe |
| notification | 4010 | @script-manifest/notification-service | In-memory |
| script-storage | 4011 | @script-manifest/script-storage-service | MinIO |
| writer-web | 3000 | @script-manifest/writer-web | — |

## Architecture Patterns

### Service Factory

Every Fastify service uses `buildServer(options)` with dependency injection:

```typescript
export function buildServer(options: XServiceOptions = {}): FastifyInstance
```

Tests: `buildServer({ logger: false, repository: new MemoryRepo() })` + `server.inject()`.

### Repository Pattern

DB-backed services (identity, profile-project, feedback-exchange, ranking, coverage-marketplace) define a repository interface with:
- `PgXRepository` for production (PostgreSQL via `@script-manifest/db`)
- `MemoryXRepository` for tests (in-memory implementations within test files)

### API Gateway

- Route modules in `services/api-gateway/src/routes/` — one per domain
- `GatewayContext` type passed to all route registrars
- `registerXRoutes(server, ctx)` pattern for each route module
- `proxyJsonRequest()` for upstream proxying with error wrapping
- `getUserIdFromAuth()` resolves Bearer token → userId via identity service
- `addAuthUserIdHeader()` injects `x-auth-user-id` on downstream requests

### Health Endpoints

All services expose: `GET /health` (deep), `GET /health/live` (liveness), `GET /health/ready` (readiness).

### Auth Flow

Frontend stores session in localStorage (`script_manifest_session`). Requests include `Authorization: Bearer <token>`. Gateway validates via identity service and propagates `x-auth-user-id`.

### Contracts

Shared Zod schemas + TypeScript types in `packages/contracts/`. All API request/response shapes defined here. Services import from `@script-manifest/contracts`.

## Testing

- **Services**: `node:test` + `node:assert/strict` (Node.js built-in test runner)
- **Frontend**: Vitest + React Testing Library + jsdom
- **Pattern**: Tests co-located as `*.test.ts` files alongside source

## Git Workflow

- **NEVER commit or push directly to `main`.** All changes go through feature branches + PRs.
- Branch format: `codex/phase-<n>-<short-feature-slug>`
- Create from latest: `git fetch origin && git checkout main && git pull --ff-only`
- Task tracking: Beads (`bd`) as local source of truth, mirrored to [Linear project](https://linear.app/fullchaos/project/script-manifest-15384341055a) via `linear` CLI

## Known Gotchas

- **Fastify empty JSON bodies**: `content-type: application/json` with no body causes `FST_ERR_CTP_EMPTY_JSON_BODY`. Don't set content-type on bodyless POST requests.
- **pg TIMESTAMPTZ**: PostgreSQL `pg` driver returns `TIMESTAMPTZ` as JS `Date` objects, not strings. Zod `z.string().datetime()` will fail — use `instanceof Date` check + `.toISOString()`.

## Linear

This project uses **Linear** for issue tracking.
Default team: **CHAOS**

### Creating Issues

```bash
# Create a simple issue
linear issues create "Fix login bug" --team CHAOS --priority high

# Create with full details and dependencies
linear issues create "Add OAuth integration" \
  --team CHAOS \
  --description "Integrate Google and GitHub OAuth providers" \
  --parent CHAOS-100 \
  --depends-on CHAOS-99 \
  --labels "backend,security" \
  --estimate 5

# List and view issues
linear issues list
linear issues get CHAOS-123
```

### Claude Code Skills

Available workflow skills (install with `linear skills install --all`):
- `/prd` - Create agent-friendly tickets with PRDs and sub-issues
- `/triage` - Analyze and prioritize backlog
- `/cycle-plan` - Plan cycles using velocity analytics
- `/retro` - Generate sprint retrospectives
- `/deps` - Analyze dependency chains

Run `linear skills list` for details.
