# Script Manifest

A rebuild of the core Coverfly writer ecosystem: portfolio hosting, competition tracking, ranking/discovery, feedback systems, and industry discovery.

## Current Status

- Phase 0 complete: product/legal foundation and architecture decisions.
- Phase 1 in progress on branch `codex/phase-1-writer-hub`.
- Local development stack: Docker Compose with PostgreSQL, Redis, OpenSearch, MinIO, Redpanda, and Mailpit.

## Phase 0 Deliverables

See:
- `docs/phase-0/README.md`
- `docs/phase-0/data-model-v1.md`
- `docs/phase-0/notification-architecture.md`

## Local Infrastructure

```bash
docker compose -f infra/docker-compose.yml up -d
```

OpenSearch: `http://localhost:9200`
Mailpit UI: `http://localhost:8025`
MinIO Console: `http://localhost:9001`
Redpanda Console: `http://localhost:8080`

## Workspace Bootstrap (Phase 1)

```bash
pnpm install
pnpm test
pnpm typecheck
```

Start MVP shell services:

```bash
pnpm --filter @script-manifest/identity-service dev
pnpm --filter @script-manifest/profile-project-service dev
pnpm --filter @script-manifest/api-gateway dev
pnpm --filter @script-manifest/writer-web dev
```

Or use compose profile:

```bash
docker compose -f infra/docker-compose.yml --profile phase1-apps up -d
```
