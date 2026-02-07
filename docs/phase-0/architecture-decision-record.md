# Architecture Decision Record: Phase 0 Foundation

## Status

Accepted

## Date

2026-02-06

## Context

The platform needs to support writer-facing workflows, industry discovery, marketplace transactions, ranking computation, and high-volume notifications. Early over-fragmentation creates delivery risk, while monolith lock-in creates scaling risk.

## Decisions

- Use a TypeScript monorepo with separate deployable services from the start.
- Use PostgreSQL as system of record.
- Use OpenSearch from Phase 1 for search/discovery and leaderboard query patterns.
- Use object storage-compatible API (S3/MinIO local) for scripts and reports.
- Use event bus (Redpanda/Kafka API) for asynchronous notifications and ranking ingestion.
- Run local development via Docker Compose with all core infra dependencies.

## Consequences

- Higher initial DevOps complexity, lower re-platform risk in Phases 3-5.
- Search quality can scale with index tuning instead of database-only fallback rewrites.
- Event contracts must be versioned early to avoid downstream churn.

---

# ADR: Auth Boundary — Gateway Token Resolution + Header Injection

## Status

Accepted

## Date

2026-02-07

## Context

The API gateway originally proxied mutation requests (project create, submission create, draft create) without verifying identity. Backend services trusted client-supplied `ownerUserId` / `writerId` in request bodies, allowing any caller to impersonate any user.

## Decisions

- **Gateway resolves identity**: All mutation routes call `getUserIdFromAuth()`, which validates the Bearer token against the identity service's `/internal/auth/me` endpoint. The resolved user ID is injected as an `x-auth-user-id` header on the downstream request.
- **Soft auth pattern**: `getUserIdFromAuth` returns `null` on failure rather than responding with 401 directly. Downstream services enforce auth by checking the header and returning 403 when missing.
- **Internal schema separation**: Public-facing Zod schemas (`ProjectCreateRequestSchema`, `SubmissionCreateRequestSchema`, etc.) no longer include user identity fields. Internal variants (`ProjectCreateInternalSchema`, `SubmissionCreateInternalSchema`) extend the public schemas with the user ID field, used only by backend services.
- **Frontend sends Bearer tokens**: All fetch calls include an `Authorization: Bearer <token>` header via a shared `getAuthHeaders()` helper. User identity fields are removed from request payloads.

## Consequences

- No service trusts client-supplied identity. User ID always flows from the gateway's token resolution.
- Adding new authenticated routes follows a single pattern: call `getUserIdFromAuth`, pass via `addAuthUserIdHeader`, use the `*InternalSchema` variant downstream.
- The soft auth approach means unauthenticated requests still reach backend services (as `x-auth-user-id: ""`), which respond with 403. This avoids gateway-level 401 responses for internal routing flexibility.
