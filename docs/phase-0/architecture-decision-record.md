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
