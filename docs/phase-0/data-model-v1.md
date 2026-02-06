# Data Model v1 (Locked for Phase 1)

## Core Entities

- `users`: writer, provider, industry, admin accounts
- `writer_profiles`: bio, demographics, genre prefs, representation, credits
- `projects`: script metadata and discovery settings
- `drafts`: versioned script files per project
- `co_writers`: many-to-many writer/project collaboration mapping
- `competitions`: curated directory records
- `submissions`: writer/project to competition submissions
- `placements`: verified outcomes for submissions
- `coverage_orders`: paid coverage lifecycle records
- `coverage_scores`: normalized score outputs for ranking
- `rank_events`: immutable input events used by ranking engine
- `tokens_ledger`: peer exchange credit/debit history
- `notifications`: queued and delivered notifications
- `audit_log`: security, access, and moderation events

## Entity Ownership and Boundaries

- Source of truth is PostgreSQL.
- Search projection lives in OpenSearch indexes.
- Binary files (scripts/reports) live in object storage, referenced by URI metadata in relational tables.

## Relationship Notes

- A `user` has one `writer_profile` when account type includes writer.
- A `project` has many `drafts` and many `submissions`.
- A `submission` can have zero or one `placement` per competition stage entry.
- `rank_events` are append-only and never updated in place.
- `tokens_ledger` is append-only and must net to current wallet balance.

## ID and Audit Strategy

- Public IDs: ULID/UUIDv7 style sortable IDs.
- Internal IDs may be numeric but cannot be exposed in APIs.
- All sensitive state transitions must emit `audit_log` entries.
