# Phase 1: MVP Hub

This phase bootstraps the first deployable codebase for:

- Writer profile shell
- Project and draft management service contracts
- Competition directory plumbing
- Baseline API gateway
- OpenSearch-ready local stack

## Active Branch

- `codex/phase-1-gap-closure`

## Tracking

- Feature issue: `#14`
- Tasks: `#15` to `#22`
- Subtasks: `#23` to `#25`
- Gap-closure feature issue: `#63`
- Gap-closure tasks: `#64`, `#65`

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
docker compose -f infra/docker-compose.yml up -d
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

Profile user guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/profile-fields-user-manual.md`

## Test Coverage Additions

- `apps/writer-web` now runs Vitest + React Testing Library:
  - API route proxy tests
  - React behavior tests for:
    - sign in/register/logout
    - profile load/save
    - project load/create/delete
    - competition search
    - submissions load/create
- `services/api-gateway` has a platform flow functionality test that validates a full gateway-mediated path:
  - auth register/me
  - profile update
  - project create/list
  - submission create/list

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
- `POST /api/v1/competitions/:competitionId/deadline-reminders` proxies reminder creation.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/competitions-calendar-reminders-user-manual.md`

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

Gateway endpoints (`:4000`):
- `POST /api/v1/scripts/upload-session`
- `POST /api/v1/scripts/register`

Writer web integration:
- Viewer page scaffold: `/projects/[scriptId]/viewer`
- Writer web API proxy: `GET /api/scripts/:scriptId/viewer` -> script-storage-service view endpoint
- Writer web API proxies:
  - `POST /api/v1/scripts/upload-session` -> gateway
  - `POST /api/v1/scripts/register` -> gateway
- Projects page draft flow (`/projects`):
  - In `Create draft`, choose a local script file.
  - Click `Upload + register script` to create upload session, upload object, and register metadata.
  - Use the returned `scriptId` in the draft form (auto-filled) and complete draft creation.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/script-upload-user-manual.md`

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

## Co-Writer + Draft Lifecycle (Issue #32)

Profile project service endpoints (`:4001`):
- `GET /internal/projects/:projectId/co-writers`
- `POST /internal/projects/:projectId/co-writers`
- `DELETE /internal/projects/:projectId/co-writers/:coWriterUserId`
- `GET /internal/projects/:projectId/drafts`
- `POST /internal/projects/:projectId/drafts`
- `PATCH /internal/projects/:projectId/drafts/:draftId`
- `POST /internal/projects/:projectId/drafts/:draftId/primary`

Gateway endpoints (`:4000`):
- `GET /api/v1/projects/:projectId/co-writers`
- `POST /api/v1/projects/:projectId/co-writers`
- `DELETE /api/v1/projects/:projectId/co-writers/:coWriterUserId`
- `GET /api/v1/projects/:projectId/drafts`
- `POST /api/v1/projects/:projectId/drafts`
- `PATCH /api/v1/projects/:projectId/drafts/:draftId`
- `POST /api/v1/projects/:projectId/drafts/:draftId/primary`
- `PATCH /api/v1/submissions/:submissionId/project`

Writer web updates:
- `/projects` now includes co-writer management and draft lifecycle controls (create/archive/set primary)
- `/submissions` now supports moving existing submissions to a different project

## OAuth Scaffold + Session UX

Identity service endpoints (`:4005`):
- `POST /internal/auth/oauth/:provider/start`
- `POST /internal/auth/oauth/:provider/complete`
- `GET /internal/auth/oauth/:provider/callback`

Gateway endpoints (`:4000`):
- `POST /api/v1/auth/oauth/:provider/start`
- `POST /api/v1/auth/oauth/:provider/complete`
- `GET /api/v1/auth/oauth/:provider/callback`

Writer web updates:
- `/signin` includes `Continue with Google` with real Google OAuth and a local mock scaffold.
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for production; falls back to mock flow when unset.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/oauth-signin-user-manual.md`

## Lightweight Leaderboard

Gateway endpoint (`:4000`):
- `GET /api/v1/leaderboard?format=&genre=&limit=&offset=`

Writer web updates:
- `/leaderboard` lists writer rows with score, submission count, placement count, and last update.
- Header navigation now exposes `Leaderboard`.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/leaderboard-user-manual.md`

## Script Access Workflow + Audit Trail

Profile project service endpoints (`:4001`):
- `POST /internal/scripts/:scriptId/access-requests`
- `GET /internal/scripts/:scriptId/access-requests`
- `POST /internal/scripts/:scriptId/access-requests/:requestId/approve`
- `POST /internal/scripts/:scriptId/access-requests/:requestId/reject`

Gateway endpoints (`:4000`):
- `POST /api/v1/scripts/:scriptId/access-requests`
- `GET /api/v1/scripts/:scriptId/access-requests`
- `POST /api/v1/scripts/:scriptId/access-requests/:requestId/approve`
- `POST /api/v1/scripts/:scriptId/access-requests/:requestId/reject`

Writer web updates:
- `/projects` now includes script-level access request creation, decisioning, and audit history.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/script-access-workflow-user-manual.md`

## Placements Workflow UX Expansion

Gateway endpoints (`:4000`):
- `GET /api/v1/placements`
- `GET /api/v1/submissions/:submissionId/placements`
- `POST /api/v1/submissions/:submissionId/placements`
- `GET /api/v1/placements/:placementId`
- `POST /api/v1/placements/:placementId/verify`

Writer web updates:
- `/submissions` can create placements and mark placements verified/rejected.

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/submissions-placements-user-manual.md`

## Admin Competition Curation

Competition directory service endpoints (`:4002`):
- `POST /internal/admin/competitions`
- `PUT /internal/admin/competitions/:competitionId`

Gateway endpoints (`:4000`):
- `POST /api/v1/admin/competitions`
- `PUT /api/v1/admin/competitions/:competitionId`

Writer web updates:
- `/admin/competitions` provides admin curation workflow.
- Header shows `Admin` link for signed-in admin-like users (`id` contains `admin`).

User guide:
- `/Users/chris/projects/script-manifest/docs/phase-1/admin-competition-curation-user-manual.md`
