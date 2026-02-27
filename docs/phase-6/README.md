# Phase 6: Programs and Events Platform

Status: Completed
External ref: `CHAOS-362`

## Objective

Launch operational programs (fee waivers, Career Lab, mentorship, live reads, Pitch Week, expanded mandates) as repeatable platform workflows, not one-off manual processes.

## Scope

In scope:
- Program catalog and applications workflow
- Review and selection workflows for cohorts
- Event scheduling and attendance tracking
- Live session integration (Zoom or equivalent)
- Mentorship matching and progress tracking
- Program KPI dashboards and outcome tracking
- CRM synchronization hooks for editorial and industry follow-up

Out of scope for this phase:
- Fully automated mentor matching decisions without human override
- Replacing CRM; only synchronization and workflow integration

## Architecture and Technology Choices

### Deployables

| Deployable | Location | Responsibility |
| --- | --- | --- |
| Programs admin web app (new) | `apps/programs-admin-web` | Internal operations for applications, cohorts, reviews, scheduling |
| Writer app extension (existing) | `apps/writer-web` | Program discovery, application submission, status tracking |
| Programs service (new) | `services/programs-service` | Program definitions, applications, cohorts, outcomes |
| Scheduling service (new) | `services/scheduling-service` | Availability windows, slotting, calendar and conferencing orchestration |
| API gateway routes (new) | `services/api-gateway/src/routes/programs.ts` | Auth + proxy for program workflows |
| Notification service extension (existing) | `services/notification-service` | Application status, event reminders, follow-up messages |
| Contracts extension | `packages/contracts/src/index.ts` | Program/application/session schemas |
| DB migrations | `packages/db/src/migrations` | Program entities, applications, cohorts, attendance, outcomes |

### Core Infrastructure Choices

- PostgreSQL as source of truth for programs, applications, and outcomes.
- Background jobs for reminders, cohort transitions, and follow-ups.
- External calendar/video integration through scheduling-service abstraction.
- Analytics snapshots stored in Postgres read models; OpenSearch optional for discoverability-only indexing.

## Planned Data Model Additions

- `programs`
- `program_tracks`
- `program_applications`
- `program_application_reviews`
- `program_cohorts`
- `program_cohort_members`
- `mentor_profiles`
- `mentor_assignments`
- `events`
- `event_registrations`
- `session_attendance`
- `program_outcomes`
- `crm_sync_queue`

## Planned API Surface

Gateway namespace:
- `GET /api/v1/programs`
- `GET /api/v1/programs/:programId/application-form`
- `POST /api/v1/programs/:programId/applications`
- `GET /api/v1/programs/:programId/applications/me`
- `PUT /api/v1/admin/programs/:programId/application-form`
- `PUT /api/v1/admin/programs/:programId/scoring-rubric`
- `POST /api/v1/admin/programs/:programId/availability`
- `POST /api/v1/admin/programs/:programId/scheduling/match`
- `POST /api/v1/admin/programs/:programId/reviews`
- `POST /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/sessions`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/attendance`
- `PATCH /api/v1/admin/programs/:programId/sessions/:sessionId/integration`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/reminders/dispatch`
- `POST /api/v1/admin/programs/:programId/mentorship/matches`
- `POST /api/v1/admin/programs/:programId/outcomes`
- `POST /api/v1/admin/programs/:programId/crm-sync`
- `GET /api/v1/admin/programs/:programId/crm-sync`
- `POST /api/v1/admin/programs/jobs/run`
- `GET /api/v1/admin/programs/:programId/analytics`

## Job and Event Plan

- Application SLA reminder job (daily)
- Session reminder job (hourly)
- Cohort transition job (daily)
- Outcome and KPI aggregation job (daily)
- CRM sync dispatcher (continuous/batched)
- Events:
  - `program_application_decision`
  - `program_application_sla_reminder`
  - `program_session_reminder`
  - `program_crm_sync_requested`

## Milestones

1. Application and cohort operations
2. Scheduling/live session infrastructure
3. Program analytics and outcomes
4. Runbook hardening and launch checklists by program type

## Final Implementation

Implemented on `codex/phase-6-programs-kickoff`:

- New deployable:
  - `services/programs-service`
- Scheduler module:
  - `services/programs-service/src/scheduler.ts` (SLA reminders, session reminders, cohort transitions, KPI snapshots, CRM dispatcher)
- New gateway routes:
  - `services/api-gateway/src/routes/programs.ts`
- New contracts:
  - `packages/contracts/src/index.ts` (program + application + cohorts + sessions + attendance + mentorship + analytics schemas)
- New DB table provisioning:
  - `packages/db/src/index.ts` (`ensureProgramsTables` with cohort/session/attendance/mentorship tables plus outcomes, CRM queue, notification log, KPI snapshots)

Internal service endpoints:

- `GET /internal/programs`
- `GET /internal/programs/:programId/application-form`
- `POST /internal/programs/:programId/applications`
- `GET /internal/programs/:programId/applications/me`
- `GET /internal/admin/programs/:programId/applications`
- `POST /internal/admin/programs/:programId/applications/:applicationId/review`
- `PUT /internal/admin/programs/:programId/application-form`
- `PUT /internal/admin/programs/:programId/scoring-rubric`
- `GET /internal/admin/programs/:programId/cohorts`
- `POST /internal/admin/programs/:programId/cohorts`
- `POST /internal/admin/programs/:programId/availability`
- `POST /internal/admin/programs/:programId/scheduling/match`
- `POST /internal/admin/programs/:programId/sessions`
- `POST /internal/admin/programs/:programId/sessions/:sessionId/attendance`
- `PATCH /internal/admin/programs/:programId/sessions/:sessionId/integration`
- `POST /internal/admin/programs/:programId/sessions/:sessionId/reminders/dispatch`
- `POST /internal/admin/programs/:programId/mentorship/matches`
- `POST /internal/admin/programs/:programId/outcomes`
- `POST /internal/admin/programs/:programId/crm-sync`
- `GET /internal/admin/programs/:programId/crm-sync`
- `POST /internal/admin/programs/jobs/run`
- `GET /internal/admin/programs/:programId/analytics`

Gateway endpoints:

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
- `POST /api/v1/admin/programs/jobs/run`
- `GET /api/v1/admin/programs/:programId/analytics`

Infrastructure updates:
- `compose.yml` now includes `programs-service`.
- `.github/workflows/docker.yml` includes `programs-service` image builds.
- Integration coverage:
  - `tests/integration/compose/programs-partner-hardening-flow.test.ts` validates outcomes persistence, CRM queueing, and admin job execution paths against the compose stack.

## Exit Criteria

- Application intake and review are auditable and repeatable.
- Events can be scheduled with reminder delivery and attendance capture.
- Mentorship pairing and lifecycle tracking are operational.
- KPI views support leadership and partner reporting.
- Program operations have complete internal runbooks.

## Documentation Deliverables

- Program operations handbook: `docs/phase-6/programs-kickoff-user-manual.md`
- Application reviewer rubric and triage guide: captured in admin review endpoint workflow
- Session scheduling and live-event runbook: captured in sessions + attendance endpoint workflow
- Mentorship operations guide: captured in mentorship match endpoint workflow
- Outcome tracking and KPI definitions: captured in analytics summary endpoint
