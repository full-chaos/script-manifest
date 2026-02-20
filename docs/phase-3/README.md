# Phase 3: Full Ranking Algorithm and Leaderboard

Status: Implemented (feature `script-manifest-94s` closed)

## Goal

Replace lightweight ranking with a production scoring engine that supports weighted placements, decay, badges, leaderboards, appeals, and moderation flags.

## Current Implementation

- Service: `services/ranking-service`
- Gateway routes: `services/api-gateway/src/routes/ranking.ts`
- Writer web surfaces: `apps/writer-web/app/leaderboard`, `apps/writer-web/app/rankings`, `apps/writer-web/app/admin/rankings`

## Key Capabilities Present

- Leaderboard API with filters
- Writer score and badges endpoints
- Published methodology endpoint
- Prestige weight management endpoints (admin)
- Full recompute + incremental recompute entrypoints
- Appeals queue and resolution endpoints
- Flagging queue and resolution endpoints
- Maintenance snapshot endpoint

## Documentation Gaps Remaining

- Scoring methodology admin operations manual
- Appeal and flag triage runbook
- Incremental recompute and maintenance job SOP

