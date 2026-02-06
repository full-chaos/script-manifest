# Phase 1: MVP Hub

This phase bootstraps the first deployable codebase for:

- Writer profile shell
- Project and draft management service contracts
- Competition directory plumbing
- Baseline API gateway
- OpenSearch-ready local stack

## Active Branch

- `codex/phase-1-writer-hub`

## Tracking

- Feature issue: `#14`
- Tasks: `#15` to `#22`
- Subtasks: `#23` to `#25`

## Bootstrapping

```bash
pnpm install
pnpm typecheck
```

Run core surfaces:

```bash
pnpm --filter @script-manifest/notification-service dev
pnpm --filter @script-manifest/writer-web dev
pnpm --filter @script-manifest/api-gateway dev
pnpm --filter @script-manifest/profile-project-service dev
pnpm --filter @script-manifest/competition-directory-service dev
pnpm --filter @script-manifest/search-indexer-service dev
```

Or boot infra + app services together:

```bash
docker compose -f infra/docker-compose.yml --profile phase1-apps up -d
```

## Notification Event Contract (Issue #21)

Envelope fields:
- `eventId`
- `eventType`
- `occurredAt`
- `actorUserId` (optional)
- `targetUserId`
- `resourceType`
- `resourceId`
- `payload`

Supported event types currently include:
- `deadline_reminder`
- `script_access_requested`
- `script_access_approved`
- `script_downloaded`

Example event payload:

```json
{
  "eventId": "evt_123",
  "eventType": "script_access_requested",
  "occurredAt": "2026-02-06T16:00:00.000Z",
  "actorUserId": "writer_02",
  "targetUserId": "writer_01",
  "resourceType": "script",
  "resourceId": "script_99",
  "payload": {
    "reason": "Please share your latest draft."
  }
}
```

Notification service endpoints:

```bash
curl http://localhost:4010/health
curl -X POST http://localhost:4010/internal/events \
  -H "content-type: application/json" \
  -d '{"eventId":"evt_1","eventType":"deadline_reminder","occurredAt":"2026-02-06T16:00:00.000Z","targetUserId":"writer_01","resourceType":"competition","resourceId":"comp_01","payload":{"deadlineAt":"2026-03-01T00:00:00.000Z"}}'
curl http://localhost:4010/internal/events/writer_01
```

Publisher examples:

```bash
curl -X POST http://localhost:4001/internal/scripts/script_99/access-requests \
  -H "content-type: application/json" \
  -d '{"requesterUserId":"writer_02","ownerUserId":"writer_01","reason":"Requesting review access"}'

curl -X POST http://localhost:4002/internal/competitions/comp_01/deadline-reminders \
  -H "content-type: application/json" \
  -d '{"targetUserId":"writer_01","deadlineAt":"2026-03-01T00:00:00.000Z","message":"Submission closes in 48 hours"}'
```

## Competition Directory + Search Indexer (Issue #18)

Directory service endpoints (`:4002`):
- `GET /health`
- `GET /internal/competitions?query=&format=&genre=&maxFeeUsd=&deadlineBefore=`
- `POST /internal/competitions` (upsert/create by `id`)
- `POST /internal/competitions/reindex` (bulk pushes all known records to search-indexer-service)
- `POST /internal/competitions/:competitionId/deadline-reminders` (publishes `deadline_reminder` event to notification-service)

Search indexer service endpoints (`:4003`):
- `GET /health`
- `POST /internal/index/competition` (indexes one document into `competitions_v1`)
- `POST /internal/index/competition/bulk` (array payload bulk indexing into `competitions_v1`)

Gateway endpoint (`:4000`):
- `GET /api/v1/competitions` proxies to directory service and supports the same filters.

Quick run:

```bash
pnpm --filter @script-manifest/search-indexer-service dev
pnpm --filter @script-manifest/competition-directory-service dev
pnpm --filter @script-manifest/api-gateway dev
```

Example upsert + query:

```bash
curl -X POST http://localhost:4002/internal/competitions \
  -H "content-type: application/json" \
  -d '{"id":"comp_002","title":"TV Pilot Launchpad","description":"Pilot contest","format":"tv","genre":"comedy","feeUsd":35,"deadline":"2026-06-10T23:59:59Z"}'

curl "http://localhost:4000/api/v1/competitions?genre=comedy&maxFeeUsd=40"
```
