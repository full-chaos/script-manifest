# Programs Operations User Manual

This manual covers the implemented Phase 6 APIs for program catalog, application lifecycle, cohort operations, session attendance, mentorship matching, and analytics.

## Endpoints

- `GET /api/v1/programs`
- `GET /api/v1/programs/:programId/application-form`
- `POST /api/v1/programs/:programId/applications`
- `GET /api/v1/programs/:programId/applications/me`
- `GET /api/v1/admin/programs/:programId/applications`
- `POST /api/v1/admin/programs/:programId/applications/:applicationId/review`
- `PUT /api/v1/admin/programs/:programId/application-form`
- `PUT /api/v1/admin/programs/:programId/scoring-rubric`
- `GET /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/availability`
- `POST /api/v1/admin/programs/:programId/scheduling/match`
- `POST /api/v1/admin/programs/:programId/sessions`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/attendance`
- `PATCH /api/v1/admin/programs/:programId/sessions/:sessionId/integration`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/reminders/dispatch`
- `POST /api/v1/admin/programs/:programId/mentorship/matches`
- `POST /api/v1/admin/programs/:programId/outcomes`
- `POST /api/v1/admin/programs/:programId/crm-sync`
- `GET /api/v1/admin/programs/:programId/crm-sync`
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

Read program application form:

```bash
curl "http://localhost:4000/api/v1/programs/<program-id>/application-form"
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

Upsert application form and rubric:

```bash
curl -X PUT "http://localhost:4000/api/v1/admin/programs/<program-id>/application-form" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "fields": [
      { "key": "goals", "label": "Goals", "type": "textarea", "required": true },
      { "key": "sample", "label": "Sample Link", "type": "url", "required": false }
    ]
  }'

curl -X PUT "http://localhost:4000/api/v1/admin/programs/<program-id>/scoring-rubric" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "criteria": [
      { "key": "voice", "label": "Voice", "weight": 0.5, "maxScore": 100 },
      { "key": "structure", "label": "Structure", "weight": 0.5, "maxScore": 100 }
    ]
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

Upsert availability and compute a scheduling match:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/availability" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "windows": [
      { "userId": "writer_01", "startsAt": "2026-06-20T16:00:00.000Z", "endsAt": "2026-06-20T18:00:00.000Z" },
      { "userId": "writer_02", "startsAt": "2026-06-20T17:00:00.000Z", "endsAt": "2026-06-20T19:00:00.000Z" }
    ]
  }'

curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/scheduling/match" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "attendeeUserIds": ["writer_01", "writer_02"],
    "durationMinutes": 45
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

Update session conferencing/reminder settings and dispatch reminders:

```bash
curl -X PATCH "http://localhost:4000/api/v1/admin/programs/<program-id>/sessions/<session-id>/integration" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "provider": "zoom",
    "meetingUrl": "https://example.com/meeting/abc123",
    "recordingUrl": "https://example.com/recordings/abc123",
    "reminderOffsetsMinutes": [120, 30]
  }'

curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/sessions/<session-id>/reminders/dispatch" \
  -H "x-admin-user-id: admin_01"
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

Record outcomes and queue CRM sync:

```bash
curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/outcomes" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "userId": "writer_01",
    "outcomeType": "signed_with_manager",
    "notes": "Signed after program demo day"
  }'

curl -X POST "http://localhost:4000/api/v1/admin/programs/<program-id>/crm-sync" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{ "reason": "weekly_follow_up" }'

curl "http://localhost:4000/api/v1/admin/programs/<program-id>/crm-sync" \
  -H "x-admin-user-id: admin_01"
```
