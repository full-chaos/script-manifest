# Discovery, Collaboration, and Mandates User Manual

This manual covers the Phase 5 discovery and collaboration APIs:

- talent search
- talent index rebuild
- industry lists, sharing, and notes
- teams and workspace membership
- activity history
- mandate browsing/creation
- mandate submissions and editorial review
- weekly digest generation with analyst overrides
- script download auditing and analytics

## Prerequisites

- Industry user has an approved account (`verificationStatus=verified`) for discovery/list operations.
- Admin reviewer is allowlisted for mandate creation.
- Writer user owns the project they submit to a mandate.

## Endpoints

Industry discovery and workspace:

- `GET /api/v1/industry/talent-search`
- `POST /api/v1/industry/talent-index/rebuild` (admin)
- `GET /api/v1/industry/lists`
- `POST /api/v1/industry/lists`
- `POST /api/v1/industry/lists/:listId/items`
- `POST /api/v1/industry/lists/:listId/notes`
- `POST /api/v1/industry/lists/:listId/share-team`
- `GET /api/v1/industry/teams`
- `POST /api/v1/industry/teams`
- `PUT /api/v1/industry/teams/:teamId/members`
- `GET /api/v1/industry/activity`

Mandates:

- `GET /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates/:mandateId/submissions`
- `GET /api/v1/industry/mandates/:mandateId/submissions` (admin)
- `POST /api/v1/industry/mandates/:mandateId/submissions/:submissionId/review` (admin)

Operations:

- `POST /api/v1/industry/digests/weekly/run`
- `GET /api/v1/industry/digests/weekly/runs`
- `POST /api/v1/industry/scripts/:scriptId/download`
- `GET /api/v1/industry/analytics`

## Talent Search

Filters:

- `q` (free-text)
- `genre`
- `format`
- `representationStatus` (`represented|unrepresented|seeking_rep`)
- `demographics` (repeatable)
- `genres` (repeatable)
- `sort` (`recent|relevance`)
- `limit` / `offset`

Example:

```bash
curl "http://localhost:4000/api/v1/industry/talent-search?genre=Drama&format=feature&limit=20" \
  -H "authorization: Bearer <session-token>"
```

## Lists and Notes

Create a list:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/lists" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "name": "Drama Prospects",
    "description": "First pass",
    "isShared": true
  }'
```

Add list item:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/lists/<list-id>/items" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "writerUserId": "writer_01",
    "projectId": "project_01"
  }'
```

Add note:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/lists/<list-id>/notes" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "writerUserId": "writer_01",
    "body": "Strong voice and clear stakes."
  }'
```

Share list with a team:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/lists/<list-id>/share-team" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "teamId": "<team-id>",
    "permission": "edit"
  }'
```

Create team and add member:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/teams" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{ "name": "Assistants" }'

curl -X PUT "http://localhost:4000/api/v1/industry/teams/<team-id>/members" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "userId": "industry_02",
    "role": "viewer"
  }'
```

## Mandates

Create mandate (admin only):

```bash
curl -X POST "http://localhost:4000/api/v1/industry/mandates" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "type": "mandate",
    "title": "Contained thrillers wanted",
    "description": "Producer request",
    "format": "feature",
    "genre": "Thriller",
    "opensAt": "2026-02-23T00:00:00.000Z",
    "closesAt": "2026-03-23T00:00:00.000Z"
  }'
```

Submit writer project to mandate:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/mandates/<mandate-id>/submissions" \
  -H "authorization: Bearer <writer-session-token>" \
  -H "content-type: application/json" \
  -d '{
    "projectId": "project_01",
    "fitExplanation": "Matches budget and tone."
  }'
```

Review and forward a submission (admin):

```bash
curl -X POST "http://localhost:4000/api/v1/industry/mandates/<mandate-id>/submissions/<submission-id>/review" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "status": "forwarded",
    "editorialNotes": "Strong fit for the brief.",
    "forwardedTo": "manager@studio.com"
  }'
```

## Digest and Analytics

Generate weekly digest:

```bash
curl -X POST "http://localhost:4000/api/v1/industry/digests/weekly/run" \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{
    "limit": 10,
    "overrideWriterIds": ["writer_01"],
    "notes": "Analyst override for top emerging writer."
  }'
```

Download script (permission checked, audited, and notifies writer):

```bash
curl -X POST "http://localhost:4000/api/v1/industry/scripts/<script-id>/download" \
  -H "authorization: Bearer <session-token>"
```

Read analytics summary:

```bash
curl "http://localhost:4000/api/v1/industry/analytics?windowDays=30" \
  -H "authorization: Bearer <session-token>"
```
