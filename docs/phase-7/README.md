# Phase 7: Partner Dashboard for Competition Organizers

Status: Completed
External ref: `CHAOS-372`

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
- `PUT /api/v1/partners/competitions/:competitionId/memberships/:userId`
- `PUT /api/v1/partners/competitions/:competitionId/intake`
- `POST /api/v1/partners/competitions/:competitionId/submissions`
- `GET /api/v1/partners/competitions/:competitionId/submissions`
- `POST /api/v1/partners/competitions/:competitionId/messages`
- `GET /api/v1/partners/competitions/:competitionId/messages`
- `POST /api/v1/partners/competitions/:competitionId/judges/assign`
- `POST /api/v1/partners/competitions/:competitionId/judges/auto-assign`
- `POST /api/v1/partners/competitions/:competitionId/jobs/run`
- `POST /api/v1/partners/competitions/:competitionId/evaluations`
- `POST /api/v1/partners/competitions/:competitionId/normalize`
- `POST /api/v1/partners/competitions/:competitionId/publish-results`
- `POST /api/v1/partners/competitions/:competitionId/draft-swaps`
- `GET /api/v1/partners/competitions/:competitionId/analytics`
- `POST /api/v1/partners/integrations/filmfreeway/sync`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/claim`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/complete`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/fail`
- `POST /api/v1/partners/integrations/filmfreeway/sync/run-next`

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

1. Organizer workspace and submission ops
2. Judge workflow and normalization
3. Publication + integration + analytics
4. Operational readiness and partner onboarding playbook

## Final Implementation

Implemented on `codex/phase-7-partner-dashboard-complete`:

- New deployable:
  - `services/partner-dashboard-service`
- New gateway routes:
  - `services/api-gateway/src/routes/partners.ts`
- Contracts extension:
  - `packages/contracts/src/index.ts` (partner competition, submission, judging, evaluation, normalization, publication, draft swap, analytics, and sync schemas)
- DB provisioning:
  - `packages/db/src/index.ts` (`ensurePartnerTables`)
- Runtime wiring:
  - `compose.yml` (`partner-dashboard-service` and gateway env wiring)
  - `.github/workflows/docker.yml` (partner image build)
  - `services/api-gateway/src/routes/partners.ts` now resolves authenticated actor identity (`x-auth-user-id`, `x-partner-user-id`, or bearer token) and forwards actor headers to partner service.
- Integration coverage:
  - `tests/integration/compose/programs-partner-hardening-flow.test.ts` validates memberships, intake persistence, judging/evaluation/normalization/publication paths, entrant messaging, and sync job lifecycle.

Internal service endpoints:

- `POST /internal/partners/competitions`
- `PUT /internal/partners/competitions/:competitionId/memberships/:userId`
- `PUT /internal/partners/competitions/:competitionId/intake`
- `POST /internal/partners/competitions/:competitionId/submissions`
- `GET /internal/partners/competitions/:competitionId/submissions`
- `POST /internal/partners/competitions/:competitionId/messages`
- `GET /internal/partners/competitions/:competitionId/messages`
- `POST /internal/partners/competitions/:competitionId/judges/assign`
- `POST /internal/partners/competitions/:competitionId/judges/auto-assign`
- `POST /internal/partners/competitions/:competitionId/jobs/run`
- `POST /internal/partners/competitions/:competitionId/evaluations`
- `POST /internal/partners/competitions/:competitionId/normalize`
- `POST /internal/partners/competitions/:competitionId/publish-results`
- `POST /internal/partners/competitions/:competitionId/draft-swaps`
- `GET /internal/partners/competitions/:competitionId/analytics`
- `POST /internal/partners/integrations/filmfreeway/sync`
- `POST /internal/partners/integrations/filmfreeway/sync/jobs/claim`
- `POST /internal/partners/integrations/filmfreeway/sync/jobs/:jobId/complete`
- `POST /internal/partners/integrations/filmfreeway/sync/jobs/:jobId/fail`
- `POST /internal/partners/integrations/filmfreeway/sync/run-next`

Gateway endpoints:

- `POST /api/v1/partners/competitions`
- `PUT /api/v1/partners/competitions/:competitionId/memberships/:userId`
- `PUT /api/v1/partners/competitions/:competitionId/intake`
- `POST /api/v1/partners/competitions/:competitionId/submissions`
- `GET /api/v1/partners/competitions/:competitionId/submissions`
- `POST /api/v1/partners/competitions/:competitionId/messages`
- `GET /api/v1/partners/competitions/:competitionId/messages`
- `POST /api/v1/partners/competitions/:competitionId/judges/assign`
- `POST /api/v1/partners/competitions/:competitionId/judges/auto-assign`
- `POST /api/v1/partners/competitions/:competitionId/jobs/run`
- `POST /api/v1/partners/competitions/:competitionId/evaluations`
- `POST /api/v1/partners/competitions/:competitionId/normalize`
- `POST /api/v1/partners/competitions/:competitionId/publish-results`
- `POST /api/v1/partners/competitions/:competitionId/draft-swaps`
- `GET /api/v1/partners/competitions/:competitionId/analytics`
- `POST /api/v1/partners/integrations/filmfreeway/sync`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/claim`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/complete`
- `POST /api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/fail`
- `POST /api/v1/partners/integrations/filmfreeway/sync/run-next`

## Exit Criteria

- Organizers can run a full submission cycle end-to-end.
- Judge assignment and evaluation processing are auditable and fair.
- Published results sync into writer profiles and ranking calculations.
- FilmFreeway bridge supports import reconciliation without duplication.
- Partner operations have clear support and incident runbooks.

## Documentation Deliverables

- Organizer onboarding and RBAC guide: `docs/phase-7/partner-dashboard-user-manual.md`
- Judge assignment and scoring operations manual: included in judge/evaluation/normalization endpoint workflow
- Result publication and rollback runbook: included in publish-results endpoint workflow
- FilmFreeway integration and reconciliation guide: included in sync endpoint workflow
- Draft swap and fee handling policy: included in draft-swaps endpoint workflow
