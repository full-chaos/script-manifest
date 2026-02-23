# Discovery, Collaboration, and Mandates User Manual

This manual covers the Phase 5 discovery and collaboration APIs:

- talent search
- industry lists
- list notes
- mandate browsing/creation
- mandate submissions

## Prerequisites

- Industry user has an approved account (`verificationStatus=verified`) for discovery/list operations.
- Admin reviewer is allowlisted for mandate creation.
- Writer user owns the project they submit to a mandate.

## Endpoints

Industry discovery and workspace:

- `GET /api/v1/industry/talent-search`
- `GET /api/v1/industry/lists`
- `POST /api/v1/industry/lists`
- `POST /api/v1/industry/lists/:listId/items`
- `POST /api/v1/industry/lists/:listId/notes`

Mandates:

- `GET /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates/:mandateId/submissions`

## Talent Search

Filters:

- `q` (free-text)
- `genre`
- `format`
- `representationStatus` (`represented|unrepresented|seeking_rep`)
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
