# Programs Kickoff User Manual

This manual covers the initial Phase 6 kickoff APIs for program catalog, writer applications, and admin review actions.

## Endpoints

- `GET /api/v1/programs`
- `POST /api/v1/programs/:programId/applications`
- `GET /api/v1/programs/:programId/applications/me`
- `GET /api/v1/admin/programs/:programId/applications`
- `POST /api/v1/admin/programs/:programId/applications/:applicationId/review`

## Writer Flow

List open programs:

```bash
curl "http://localhost:4000/api/v1/programs?status=open"
```

Submit program application:

```bash
curl -X POST "http://localhost:4000/api/v1/programs/<program-id>/applications" \
  -H "authorization: Bearer <writer-session-token>" \
  -H "content-type: application/json" \
  -d '{
    "statement": "I want to join this cohort because...",
    "sampleProjectId": "project_01"
  }'
```

View your own applications:

```bash
curl "http://localhost:4000/api/v1/programs/<program-id>/applications/me" \
  -H "authorization: Bearer <writer-session-token>"
```

## Admin Flow

List submitted applications:

```bash
curl "http://localhost:4000/api/v1/admin/programs/<program-id>/applications" \
  -H "x-admin-user-id: admin_01"
```

Review application:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/applications/<application-id>/review" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "status": "accepted",
    "score": 92,
    "decisionNotes": "Strong statement and clear career goals."
  }'
```
