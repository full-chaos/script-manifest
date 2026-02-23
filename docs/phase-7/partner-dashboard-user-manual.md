# Partner Dashboard User Manual

This manual covers the implemented Phase 7 organizer workflows for competition operations, judging, publication, draft swaps, and FilmFreeway sync queuing.

## Endpoints

- `POST /api/v1/partners/competitions`
- `GET /api/v1/partners/competitions/:competitionId/submissions`
- `POST /api/v1/partners/competitions/:competitionId/judges/assign`
- `POST /api/v1/partners/competitions/:competitionId/evaluations`
- `POST /api/v1/partners/competitions/:competitionId/normalize`
- `POST /api/v1/partners/competitions/:competitionId/publish-results`
- `POST /api/v1/partners/competitions/:competitionId/draft-swaps`
- `GET /api/v1/partners/competitions/:competitionId/analytics`
- `POST /api/v1/partners/integrations/filmfreeway/sync`

All endpoints require an allowlisted organizer/admin identity through `x-admin-user-id` or an allowlisted bearer token resolved by identity-service.

## Organizer Flow

Create competition:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "organizerAccountId": "organizer_01",
    "slug": "spring-fellowship-2026",
    "title": "Spring Fellowship 2026",
    "description": "Annual script fellowship",
    "format": "feature",
    "genre": "drama",
    "status": "open",
    "submissionOpensAt": "2026-01-01T00:00:00.000Z",
    "submissionClosesAt": "2026-03-01T00:00:00.000Z"
  }'
```

List submissions:

```bash
curl "http://localhost:4000/api/v1/partners/competitions/<competition-id>/submissions" \
  -H "x-admin-user-id: admin_01"
```

Assign judge:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions/<competition-id>/judges/assign" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "judgeUserId": "judge_01",
    "submissionIds": ["submission_01", "submission_02"]
  }'
```

Submit evaluation:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions/<competition-id>/evaluations" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "submissionId": "submission_01",
    "judgeUserId": "judge_01",
    "round": "quarterfinal",
    "score": 87,
    "notes": "Strong premise and character voice."
  }'
```

Normalize scores:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions/<competition-id>/normalize" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{ "round": "quarterfinal" }'
```

Publish results:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions/<competition-id>/publish-results" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "results": [
      { "submissionId": "submission_01", "placementStatus": "winner" }
    ],
    "notes": "Official round publication"
  }'
```

Process draft swap:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/competitions/<competition-id>/draft-swaps" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "submissionId": "submission_01",
    "replacementScriptId": "script_99",
    "feeCents": 500,
    "reason": "Writer uploaded polished draft"
  }'
```

Get competition analytics:

```bash
curl "http://localhost:4000/api/v1/partners/competitions/<competition-id>/analytics" \
  -H "x-admin-user-id: admin_01"
```

Queue FilmFreeway sync:

```bash
curl -X POST "http://localhost:4000/api/v1/partners/integrations/filmfreeway/sync" \
  -H "x-admin-user-id: admin_01" \
  -H "content-type: application/json" \
  -d '{
    "competitionId": "<competition-id>",
    "direction": "import"
  }'
```
