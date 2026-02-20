# Phase 7: Partner Dashboard for Competition Organizers

Status: Planned (feature `script-manifest-nzi` open)
External ref: `gh-127`

## Objective

Provide a competition organizer backend for submission intake, judge workflows, normalized scoring, and result publication directly into writer profiles and rankings.

## Scope

In scope:
- Organizer accounts and competition-level RBAC
- Submission intake and management
- Judge assignment and workload balancing
- Evaluation forms and score normalization
- Results publication and sync to writer profile/ranking systems
- Entrant communications and organizer analytics
- FilmFreeway bridge for submission synchronization
- Draft swap workflow (including optional fee handling)

Out of scope for this phase:
- Full replacement of all third-party festival tooling on day one
- Fully self-serve partner API monetization (deferred to post-launch hardening)

## Beads Breakdown

- `script-manifest-nzi.1`: Organizer workspace and submission operations
- `script-manifest-nzi.2`: Judging workflow and scoring normalization
- `script-manifest-nzi.3`: Results publishing, integrations, and organizer analytics

## Architecture and Technology Choices

### Deployables

| Deployable | Location | Responsibility |
| --- | --- | --- |
| Partner dashboard web app (new) | `apps/partner-dashboard-web` | Organizer and judge interfaces |
| Partner service (new) | `services/partner-dashboard-service` | Competition setup, submissions, judge workflows |
| Scoring service extension (existing) | `services/ranking-service` | Score normalization and prestige alignment hooks |
| Submission service extension (existing) | `services/submission-tracking-service` | Bidirectional sync for entrant records and placements |
| API gateway routes (new) | `services/api-gateway/src/routes/partners.ts` | Auth + proxy for partner endpoints |
| FilmFreeway sync worker (new) | `services/filmfreeway-sync-service` | Import/export bridge, retries, reconciliation |
| Notification service extension (existing) | `services/notification-service` | Entrant and organizer communications |
| Contracts extension | `packages/contracts/src/index.ts` | Organizer, judge, scoring, and publication schemas |
| DB migrations | `packages/db/src/migrations` | Competitions, submissions, judges, evaluations, publication artifacts |

### Core Infrastructure Choices

- PostgreSQL remains authoritative for organizer configuration and scoring artifacts.
- OpenSearch optional only for organizer reporting filters; not required for core correctness.
- Event-driven publication: result events feed profile and ranking recalculation pipelines.
- Integration reliability via dedicated sync worker with idempotent import keys.

## Planned Data Model Additions

- `organizer_accounts`
- `organizer_memberships`
- `partner_competitions`
- `partner_submission_windows`
- `partner_submissions`
- `partner_submission_assets`
- `judge_profiles`
- `judge_assignments`
- `evaluation_forms`
- `evaluation_scores`
- `score_normalization_runs`
- `published_results`
- `entrant_messages`
- `filmfreeway_sync_jobs`
- `draft_swap_requests`

## Planned API Surface

Gateway namespace:
- `POST /api/v1/partners/competitions`
- `GET /api/v1/partners/competitions/:competitionId/submissions`
- `POST /api/v1/partners/competitions/:competitionId/judges/assign`
- `POST /api/v1/partners/competitions/:competitionId/evaluations`
- `POST /api/v1/partners/competitions/:competitionId/normalize`
- `POST /api/v1/partners/competitions/:competitionId/publish-results`
- `POST /api/v1/partners/competitions/:competitionId/draft-swaps`
- `GET /api/v1/partners/competitions/:competitionId/analytics`
- `POST /api/v1/partners/integrations/filmfreeway/sync`

## Job and Event Plan

- Judge assignment balancing job (hourly/demand-based)
- Normalization recompute job (nightly and pre-publication)
- Results publication sync job (event-driven)
- FilmFreeway reconciliation job (scheduled)
- Entrant reminder job (daily during active windows)
- Events:
  - `partner_submission_received`
  - `partner_score_normalized`
  - `partner_results_published`
  - `partner_draft_swap_processed`

## Milestones

1. Organizer workspace and submission ops (`script-manifest-nzi.1`)
2. Judge workflow and normalization (`script-manifest-nzi.2`)
3. Publication + integration + analytics (`script-manifest-nzi.3`)
4. Operational readiness and partner onboarding playbook

## Exit Criteria

- Organizers can run a full submission cycle end-to-end.
- Judge assignment and evaluation processing are auditable and fair.
- Published results sync into writer profiles and ranking calculations.
- FilmFreeway bridge supports import reconciliation without duplication.
- Partner operations have clear support and incident runbooks.

## Documentation Deliverables for Completion

- Organizer onboarding and RBAC guide
- Judge assignment and scoring operations manual
- Result publication and rollback runbook
- FilmFreeway integration and reconciliation guide
- Draft swap and fee handling policy

