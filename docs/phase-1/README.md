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
pnpm test
pnpm typecheck
```

Run core surfaces:

```bash
pnpm --filter @script-manifest/identity-service dev
pnpm --filter @script-manifest/notification-service dev
pnpm --filter @script-manifest/writer-web dev
pnpm --filter @script-manifest/api-gateway dev
pnpm --filter @script-manifest/profile-project-service dev
pnpm --filter @script-manifest/competition-directory-service dev
pnpm --filter @script-manifest/search-indexer-service dev
pnpm --filter @script-manifest/script-storage-service dev
pnpm --filter @script-manifest/submission-tracking-service dev
```

Or boot infra + app services together:

```bash
docker compose -f infra/docker-compose.yml --profile phase1-apps up -d
```

## Auth + Profile/Project CRUD (Issue #29)

Identity service endpoints (`:4005`):
- `GET /health`
- `POST /internal/auth/register`
- `POST /internal/auth/login`
- `GET /internal/auth/me`
- `POST /internal/auth/logout`

Gateway endpoints (`:4000`):
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `GET /api/v1/profiles/:writerId`
- `PUT /api/v1/profiles/:writerId`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:projectId`
- `PUT /api/v1/projects/:projectId`
- `DELETE /api/v1/projects/:projectId`

Writer web pages now wired to the gateway:
- `/signin`
- `/profile`
- `/projects`
- `/competitions`
- `/submissions`

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

## Script Storage + In-Browser Viewer Scaffold (Issue #20)

Script storage service endpoints (`:4011`):
- `GET /health`
- `POST /internal/scripts/upload-session` (returns mock upload URL + form fields + object metadata)
- `POST /internal/scripts/register` (registers uploaded object metadata by `scriptId`)
- `GET /internal/scripts/:scriptId/view?viewerUserId=` (returns viewer payload with object path/URL + access flags)

Writer web integration:
- Viewer page scaffold: `/projects/[scriptId]/viewer`
- Writer web API proxy: `GET /api/scripts/:scriptId/viewer` -> script-storage-service view endpoint

Quick run:

```bash
pnpm --filter @script-manifest/script-storage-service dev
pnpm --filter @script-manifest/writer-web dev
```

Example storage + viewer flow:

```bash
curl http://localhost:4011/health

curl -X POST http://localhost:4011/internal/scripts/upload-session \
  -H "content-type: application/json" \
  -d '{"scriptId":"script_demo_01","ownerUserId":"writer_01","filename":"demo-script.pdf","contentType":"application/pdf","size":240000}'

curl -X POST http://localhost:4011/internal/scripts/register \
  -H "content-type: application/json" \
  -d '{"scriptId":"script_demo_01","ownerUserId":"writer_01","objectKey":"writer_01/script_demo_01/latest.pdf","filename":"demo-script.pdf","contentType":"application/pdf","size":240000}'

curl "http://localhost:4011/internal/scripts/script_demo_01/view?viewerUserId=writer_01"

curl "http://localhost:3000/api/scripts/script_demo_01/viewer"
```

## Submission Tracking + Placement Verification (Issue #19)

Submission tracking service endpoints (`:4004`):
- `GET /health`
- `POST /internal/submissions`
- `GET /internal/submissions?writerId=&projectId=&competitionId=&status=`
- `POST /internal/submissions/:submissionId/placements`
- `POST /internal/placements/:placementId/verify`

Submission status values:
- `pending`
- `quarterfinalist`
- `semifinalist`
- `finalist`
- `winner`

Gateway endpoints (`:4000`):
- `GET /api/v1/submissions`
- `POST /api/v1/submissions`

Quick run:

```bash
pnpm --filter @script-manifest/submission-tracking-service dev
pnpm --filter @script-manifest/api-gateway dev
```

Example submission + placement flow:

```bash
curl -X POST http://localhost:4000/api/v1/submissions \
  -H "content-type: application/json" \
  -d '{"writerId":"writer_01","projectId":"project_01","competitionId":"comp_001","status":"pending"}'

curl "http://localhost:4000/api/v1/submissions?writerId=writer_01&competitionId=comp_001"

curl -X POST http://localhost:4004/internal/submissions/submission_123/placements \
  -H "content-type: application/json" \
  -d '{"status":"quarterfinalist"}'

curl -X POST http://localhost:4004/internal/placements/placement_123/verify \
  -H "content-type: application/json" \
  -d '{"verificationState":"verified"}'
```
