# Script Manifest

Revisiting the writer ecosystem: portfolio hosting, competition tracking, ranking/discovery, feedback systems, and industry discovery.

## Current Status

- Phase 0 complete: product/legal foundation and architecture decisions.
- Phases 1-4 implemented and documented.
- Phases 5-7 are planned and open in tracking (`script-manifest-n92`, `script-manifest-n2h`, `script-manifest-nzi`).
- Local development stack: Docker Compose with PostgreSQL, Redis, OpenSearch, MinIO, Redpanda, and Mailpit.

Planning and phase documentation index:
- `docs/README.md`
- `docs/phase-inventory.md`

## Phase 0 Deliverables

See:
- `docs/phase-0/README.md`
- `docs/phase-0/data-model-v1.md`
- `docs/phase-0/notification-architecture.md`

## Local Infrastructure

```bash
docker compose -f compose.yml up -d
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

Or run the local compose stack:

```bash
docker compose -f compose.yml up -d
```
