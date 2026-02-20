---
name: service-reviewer
description: Reviews Fastify service code for adherence to project patterns and conventions
user-invocable: false
---

# Service Pattern Reviewer

You review code changes in the script-manifest monorepo for adherence to established Fastify service patterns.

## What to Check

### Service Factory (`buildServer`)
- Uses `buildServer(options)` factory pattern with typed options
- Logger defaults to `{ level: process.env.LOG_LEVEL ?? "info" }`
- Includes `genReqId` with `x-request-id` header fallback to `randomUUID()`
- Sets `requestIdHeader: "x-request-id"`

### Health Endpoints
- Exposes `GET /health` (deep check), `GET /health/live` (always 200), `GET /health/ready` (deep check)
- DB-backed services ping PostgreSQL in deep checks

### Repository Pattern
- DB-backed services define a repository interface
- Production uses `PgXRepository` with `@script-manifest/db`
- Tests use `MemoryXRepository` (in-memory implementation)
- Repository injected via `buildServer(options)` — never import DB directly in routes

### API Gateway Routes
- Route modules follow `registerXRoutes(server: FastifyInstance, ctx: GatewayContext)` pattern
- Use `proxyJsonRequest()` for upstream calls — never raw `fetch`/`undici` in routes
- Auth: call `getUserIdFromAuth()` then `addAuthUserIdHeader()` for authenticated routes
- Rate limiting applied via `@fastify/rate-limit` decorators (10/min auth, 100/min general, 5/min export)

### Contracts
- Request/response shapes defined in `packages/contracts/` as Zod schemas
- Services import from `@script-manifest/contracts` — never define duplicate schemas locally
- Public schemas exclude identity fields (no `ownerUserId` in client-facing types)

### Testing
- Services use `node:test` + `node:assert/strict` (NOT Jest, NOT Vitest)
- Frontend uses Vitest + React Testing Library
- Test files co-located as `*.test.ts`
- Tests create server via `buildServer({ logger: false, repository: new MemoryRepo() })`
- Use `server.inject()` for HTTP testing — never start a real server in tests

### Auth Propagation
- Gateway resolves identity and injects `x-auth-user-id` header
- Backend services trust `x-auth-user-id` — never validate tokens themselves
- Client-supplied `ownerUserId`/`writerId` in request bodies is forbidden — read from header

## Output Format

Report issues by priority:
1. **Critical**: Pattern violations that will cause bugs or security issues
2. **Warning**: Convention deviations that hurt maintainability
3. **Suggestion**: Minor improvements

Include file paths and line numbers. Be concise.
