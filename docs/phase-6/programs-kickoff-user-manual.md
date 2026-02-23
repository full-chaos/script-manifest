# Programs Operations User Manual

This manual covers the implemented Phase 6 APIs for program catalog, application lifecycle, cohort operations, session attendance, mentorship matching, and analytics.

## Endpoints

- `GET /api/v1/programs`
- `POST /api/v1/programs/:programId/applications`
- `GET /api/v1/programs/:programId/applications/me`
- `GET /api/v1/admin/programs/:programId/applications`
- `POST /api/v1/admin/programs/:programId/applications/:applicationId/review`
- `GET /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/sessions`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/attendance`
- `POST /api/v1/admin/programs/:programId/mentorship/matches`
- `GET /api/v1/admin/programs/:programId/analytics`

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

Create a cohort:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/cohorts" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "name": "Career Lab Cohort A",
    "summary": "Primary spring cohort",
    "startAt": "2026-06-01T00:00:00.000Z",
    "endAt": "2026-08-01T00:00:00.000Z",
    "memberApplicationIds": ["<application-id>"]
  }'
```

Schedule a session:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/sessions" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "cohortId": "<cohort-id>",
    "title": "Pitch Rehearsal Workshop",
    "sessionType": "workshop",
    "startsAt": "2026-06-15T17:00:00.000Z",
    "endsAt": "2026-06-15T18:30:00.000Z",
    "provider": "zoom",
    "meetingUrl": "https://example.com/meeting/abc123",
    "attendeeUserIds": ["writer_01", "writer_02"]
  }'
```

Record attendance:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/sessions/<session-id>/attendance" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "userId": "writer_01",
    "status": "attended",
    "notes": "Joined on time and completed exercise."
  }'
```

Create mentorship matches:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/mentorship/matches" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "cohortId": "<cohort-id>",
    "matches": [
      { "mentorUserId": "mentor_01", "menteeUserId": "writer_01", "notes": "TV pilot focus" }
    ]
  }'
```

Fetch program analytics:

```bash
curl "http://localhost:4000/api/v1/admin/programs/<program-id>/analytics" \
  -H "x-admin-user-id: admin_01"
```
