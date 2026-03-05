# Observability & Security Audit

> **Date**: 2025-03-05
> **Scope**: Full monorepo — 14 Fastify microservices, 1 Next.js frontend, shared packages, infrastructure

---

## Architecture Overview

- **14 Fastify microservices** under `services/`
- **1 Next.js frontend** (`apps/writer-web`)
- **Shared packages**: `service-utils` (boot, metrics, tracing, env), `db`, `contracts`
- **Infrastructure**: PostgreSQL, Redis, OpenSearch, MinIO, Redpanda, Jaeger, Prometheus
- **CI/CD**: GitHub Actions (`ci.yml` — lint/test/audit, `docker.yml` — build/push)

---

## Observability Inventory

### Logging — ✅ Mostly Good

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | Pino (Fastify built-in), JSON structured |
| Log levels | ✅ | Configurable via `LOG_LEVEL` env var |
| Request IDs | ✅ | `x-request-id` propagated via `plugins/requestId.ts` |
| Boot-phase logging | ⚠️ | `boot.ts` uses `console.log`, not Pino — breaks structured format during startup/crash |

All 14 services produce structured JSON logs via Pino. The only gap is the bootstrap phase in `packages/service-utils/src/boot.ts` which uses `console.log`/`console.error` — intentionally, since Pino isn't initialized yet, but this means startup and crash messages won't match log aggregator parsers.

### Metrics — ⚠️ Partially Adopted

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | `fastify-metrics` wrapping `prom-client` |
| `/metrics` endpoint | ⚠️ | Only **3/14 services** call `registerMetrics()` |
| Default metrics | ✅ | Node.js process metrics (memory, CPU, event loop lag) |
| Route metrics | ✅ | Per-route HTTP request duration histograms/summaries |
| Business metrics | ❌ | No custom counters (logins, uploads, payments, etc.) |
| Prometheus scraping | ⚠️ | `infra/prometheus/prometheus.yml` targets all 14 services, but 11 don't expose the endpoint |

**Services WITH metrics**: api-gateway, identity-service, profile-project-service
**Services WITHOUT**: notification-service, search-indexer-service, script-storage-service, submission-tracking-service, competition-directory-service, programs-service, ranking-service, partner-dashboard-service, industry-portal-service, feedback-exchange-service, coverage-marketplace-service

The shared utility in `packages/service-utils/src/metrics.ts` is well-built — just needs to be called in each service's `startServer()`.

### Tracing — ⚠️ Partially Adopted

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | OpenTelemetry `NodeSDK` with auto-instrumentations |
| Exporter | ✅ | OTLP/HTTP → Jaeger (compose has Jaeger all-in-one) |
| Activation | ✅ | Guard: only enabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| Adoption | ⚠️ | Only **3/14 services** call `setupTracing()` |
| Custom spans | ❌ | No manual instrumentation for background jobs or complex flows |

**Services WITH tracing**: api-gateway, identity-service, profile-project-service
**Services WITHOUT**: Same 11 as metrics

Since `setupTracing()` must be called before Fastify is created (to patch Node built-ins), services that skip it cannot participate in distributed trace propagation — cross-service calls hitting uninstrumented services break the trace chain.

### Health Checks — ⚠️ Inconsistent

| Area | Status | Details |
|------|--------|---------|
| `/health` endpoint | ✅ | All 14 services |
| `/health/live` + `/health/ready` | ⚠️ | 13/14 services (api-gateway only has `/health`) |
| Deep checks (DB/OpenSearch) | ⚠️ | Only identity-service, profile-project-service, search-indexer-service |
| Shallow checks | ⚠️ | 11 services return `{ ok: true }` without checking downstream dependencies |
| Docker healthchecks | ✅ | All services configured in both compose files |

**api-gateway** is the outlier — it uses a custom health plugin at `/health/live` only, missing the `/health/ready` convention the rest of the fleet follows.

### Error Handling — ⚠️ Adequate

| Area | Status | Details |
|------|--------|---------|
| Global crash handlers | ✅ | `uncaughtException` / `unhandledRejection` in `boot.ts` — logs and exits |
| Fastify error hooks | ✅ | Standard Fastify `onError` logging via Pino |
| Error correlation | ✅ | Request IDs propagated across services |
| Error reporting service | ❌ | No Sentry, Honeybadger, or equivalent |

### Alerting — ❌ Missing

| Area | Status | Details |
|------|--------|---------|
| Alerting rules | ❌ | No `alerting_rules.yml` found |
| Alertmanager | ❌ | Not in compose stack |
| PagerDuty/Slack/email | ❌ | No integration |
| Uptime monitoring | ❌ | No external probe configured |

Prometheus exists in the compose stack but is purely for scraping — no alerting pipeline.

### Frontend Observability — ❌ Missing

| Area | Status | Details |
|------|--------|---------|
| Structured logging | ❌ | Standard `console` only |
| OpenTelemetry | ❌ | Not configured |
| Error tracking | ❌ | None |
| Web vitals | ❌ | Not instrumented |

`apps/writer-web` has no observability instrumentation. API proxy routes likely lose trace context.

---

## Security Inventory

### Authentication — ✅ Good

| Area | Status | Details |
|------|--------|---------|
| Mechanism | ✅ | Opaque session tokens stored in PostgreSQL |
| OAuth | ✅ | Google OAuth with PKCE (`identity-service`) |
| Token validation | ✅ | Centralized — gateway calls `identity-service/internal/auth/me` per request |
| Token expiry | ✅ | 30-day default (`SESSION_DURATION_DAYS`) |
| Token refresh | ❌ | Not implemented |
| Dev mock auth | ✅ | Available for local development only |

Solid auth implementation. The per-request validation call adds latency but ensures token revocation is immediate.

### Authorization — ⚠️ Weak

| Area | Status | Details |
|------|--------|---------|
| RBAC | ❌ | No role system |
| Ownership enforcement | ⚠️ | Delegated to downstream services via `x-auth-user-id` header |
| Admin routes | ⚠️ | Env-var allowlists (`COVERAGE_ADMIN_ALLOWLIST`, etc.) |
| Gateway-level authz | ❌ | Gateway passes user ID only, no permission checks |

The `x-auth-user-id` header pattern works but depends entirely on every downstream service correctly checking ownership. A bug in any service could expose other users' data. Admin allowlists are comma-separated env vars — functional but not scalable.

### Input Validation — ⚠️ Partial

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | Zod (schemas in `packages/contracts/src/index.ts`) |
| Service-level | ✅ | Services use `safeParse` on request bodies |
| Gateway-level | ❌ | API gateway proxies raw request bodies without validation |

The gateway acts as a pass-through proxy — it forwards `req.body` directly to downstream services. While services validate internally, malformed payloads still traverse the network. Gateway-level schema validation would reject bad input earlier and reduce downstream load.

### Rate Limiting — ✅ Good

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | `@fastify/rate-limit` |
| Global limit | ✅ | 100 req/min (configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`) |
| Auth route limits | ✅ | Stricter 10-20 req/min on authentication endpoints |
| Scope | ✅ | Applied globally at the gateway |

### CORS — ✅ Good

| Area | Status | Details |
|------|--------|---------|
| Library | ✅ | `@fastify/cors` |
| Configuration | ✅ | Origin controlled by `CORS_ALLOWED_ORIGINS` env var |

### Security Headers — ❌ Missing

| Area | Status | Details |
|------|--------|---------|
| Helmet | ❌ | Not installed |
| CSP | ❌ | Not configured |
| HSTS | ❌ | Not configured |
| X-Frame-Options | ❌ | Not configured |
| X-Content-Type-Options | ❌ | Not configured |

No `@fastify/helmet` or equivalent in the api-gateway or any service.

### Secrets Management — ✅ Good

| Area | Status | Details |
|------|--------|---------|
| 12-factor env pattern | ✅ | All secrets via environment variables |
| Prod compose enforcement | ✅ | `${VAR:?required}` syntax forces secrets to be set |
| `.env.dev` | ✅ | Local-only, not tracked in git |
| `.gitignore` | ✅ | Correctly excludes `.env` and `.env.*` (except `.env.example`) |
| Stripe webhook validation | ✅ | `constructEvent()` verifies signatures |
| Vault/KMS | ❌ | Not used (acceptable at current scale) |
| Secret rotation | ❌ | No automated mechanism |

### SQL Injection / Query Safety — ✅ Good

| Area | Status | Details |
|------|--------|---------|
| Parameterized queries | ✅ | All queries use `$1, $2...` placeholders via `pg` |
| Dynamic queries | ✅ | `pgRepository.ts` builds queries with indexed params, no string interpolation |
| ORM | — | Not used; raw `pg` with manual parameterization |

### Network & Infrastructure — ❌ Weak

| Area | Status | Details |
|------|--------|---------|
| TLS | ❌ | All inter-service communication is plaintext HTTP |
| Network isolation | ❌ | All services on default Docker bridge network |
| Non-root containers | ❌ | All Dockerfiles lack `USER` instruction — containers run as root |
| Resource limits | ❌ | No CPU/memory limits in `compose.prod.yml` |
| Port exposure (prod) | ⚠️ | Internal service ports exposed to host in prod compose |
| Reverse proxy | ❌ | No Nginx/Traefik for TLS termination |

### CI/CD Security — ⚠️ Partial

| Area | Status | Details |
|------|--------|---------|
| Dependency audit | ⚠️ | `pnpm audit --audit-level=critical` runs but is **non-blocking** (continues on error) |
| SAST | ❌ | No CodeQL, SonarQube, or similar |
| Container scanning | ❌ | No Trivy or equivalent in `docker.yml` |
| GitHub Secrets | ✅ | CI uses `TURBO_TOKEN`, `GITHUB_TOKEN` properly |

---

## Service Consistency Matrix

| Service | `bootstrapService()` | `validateRequiredEnv()` | `registerMetrics()` | `setupTracing()` | Deep Health Check | `onClose` Shutdown |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| api-gateway | ✅ | ✅ | ✅ | ✅ | ✅ (downstream) | ✅ + OTel |
| identity-service | ✅ | ✅ | ✅ | ✅ | ✅ (DB) | ✅ + OTel |
| profile-project-service | ✅ | ✅ | ✅ | ✅ | ✅ (DB) | ✅ + OTel |
| script-storage-service | ✅ | ✅ | ❌ | ❌ | ❌ shallow | ✅ |
| submission-tracking-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ |
| ranking-service | ✅ | ✅ | ❌ | ❌ | ❌ shallow | ✅ |
| programs-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ + scheduler |
| partner-dashboard-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ |
| notification-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ |
| industry-portal-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ |
| feedback-exchange-service | ✅ | ✅ | ❌ | ❌ | ❌ shallow | ✅ |
| coverage-marketplace-service | ✅ | ✅ | ❌ | ❌ | ❌ shallow | ⚠️ timer not on `onClose` |
| competition-directory-service | ✅ | ❌ | ❌ | ❌ | ❌ shallow | ✅ |
| search-indexer-service | ✅ | ✅ | ❌ | ❌ | ✅ (OpenSearch) | ✅ |

### Notification Publishers

Three services have `notificationPublisher.ts` files (ranking-service, feedback-exchange-service, profile-project-service). Pattern:
- Validates payload with `NotificationEventEnvelopeSchema.parse()` before sending
- Uses `undici.request()` to POST to notification-service
- Checks `response.statusCode >= 400` and throws
- Calling code catches and handles: profile-project returns 502, ranking ignores (non-fatal), feedback logs warning

---

## Remediation Plan

### P0 — Immediate

| # | Item | Effort |
|---|------|--------|
| 1 | Install `@fastify/helmet` in api-gateway | 30min |
| 2 | Add `USER node` to all Dockerfiles | 1hr |
| 3 | Make `pnpm audit` blocking in CI | 15min |

### P1 — Short-term (1–2 weeks)

| # | Item | Effort |
|---|------|--------|
| 4 | Roll out `registerMetrics()` + `setupTracing()` to remaining 11 services | 3hr |
| 5 | Add `validateRequiredEnv()` to 6 services that skip it | 1hr |
| 6 | Add Zod validation to api-gateway proxy routes (POST/PUT/PATCH) | 4hr |
| 7 | Define Docker networks in `compose.prod.yml` — isolate internal services | 2hr |
| 8 | Remove internal service port exposure in `compose.prod.yml` | 1hr |
| 9 | Add deep health checks (DB/Redis/OpenSearch probes) to shallow services | 3hr |
| 10 | Standardize api-gateway to `/health/live` + `/health/ready` convention | 30min |

### P2 — Medium-term (2–4 weeks)

| # | Item | Effort |
|---|------|--------|
| 11 | Add TLS termination via reverse proxy (Nginx/Traefik) | 4hr |
| 12 | Add Prometheus alerting rules + Alertmanager to compose stack | 4hr |
| 13 | Add container scanning (Trivy) to `docker.yml` CI workflow | 2hr |
| 14 | Add SAST (CodeQL GitHub Action) | 2hr |
| 15 | Add CPU/memory resource limits to `compose.prod.yml` | 1hr |
| 16 | Pin all images to specific versions in prod compose | 30min |
| 17 | Add custom business metrics (login count, uploads, payment events) | 4hr |
| 18 | Fix coverage-marketplace shutdown — use `onClose` hook for maintenance timer | 30min |

### P3 — Longer-term (1–2 months)

| # | Item | Effort |
|---|------|--------|
| 19 | Integrate error reporting (Sentry or similar) across all services | 4hr |
| 20 | Add OpenTelemetry + web vitals to `writer-web` | 4hr |
| 21 | RBAC system — replace allowlists with proper role/permission model | 2wk |
| 22 | Signed internal auth — replace `x-auth-user-id` with signed JWT for inter-service calls | 1wk |
| 23 | Structured boot logging — replace `console.log` in `boot.ts` with Pino | 1hr |
| 24 | Token refresh — add refresh token rotation to identity-service | 3d |

---

## Summary Scorecard

| Domain | Grade | Key Gap |
|--------|-------|---------|
| **Logging** | B+ | Boot-phase uses `console` instead of structured logger |
| **Metrics** | D | Only 3/14 services instrumented |
| **Tracing** | D | Only 3/14 services instrumented |
| **Health Checks** | C | Most are shallow; no dependency probes |
| **Alerting** | F | None exists |
| **Authentication** | B+ | Solid; missing token refresh |
| **Authorization** | D | No RBAC; header pass-through only |
| **Input Validation** | C | Good at services, missing at gateway |
| **Security Headers** | F | No Helmet |
| **Secrets Management** | B+ | Clean; no vault but acceptable at current scale |
| **SQL Safety** | A | Parameterized everywhere |
| **Network/Infra** | F | Plaintext, no isolation, root containers |
| **CI/CD Security** | C | Audit exists but non-blocking; no SAST |
