# Phase 6: Programs and Events Platform

Status: In Progress (feature `script-manifest-n2h`)
External ref: `gh-117`

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

## Beads Breakdown

- `script-manifest-n2h.1`: Applications and cohort operations
- `script-manifest-n2h.2`: Scheduling and live session infrastructure
- `script-manifest-n2h.3`: Program analytics and outcome tracking

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
- `POST /api/v1/programs/:programId/applications`
- `GET /api/v1/programs/:programId/applications/me`
- `POST /api/v1/admin/programs/:programId/reviews`
- `POST /api/v1/admin/programs/:programId/cohorts`
- `POST /api/v1/admin/programs/:programId/sessions`
- `POST /api/v1/admin/programs/:programId/sessions/:sessionId/attendance`
- `POST /api/v1/admin/programs/:programId/mentorship/matches`
- `GET /api/v1/admin/programs/:programId/analytics`

## Job and Event Plan

- Application SLA reminder job (daily)
- Session reminder job (hourly)
- Cohort transition job (daily)
- Outcome and KPI aggregation job (daily)
- CRM sync dispatcher (continuous/batched)
- Events:
  - `program_application_submitted`
  - `program_application_decided`
  - `program_session_scheduled`
  - `program_session_attended`

## Milestones

1. Application and cohort operations (`script-manifest-n2h.1`)
2. Scheduling/live session infrastructure (`script-manifest-n2h.2`)
3. Program analytics and outcomes (`script-manifest-n2h.3`)
4. Runbook hardening and launch checklists by program type

## Kickoff Slice (Current)

- Lock contracts for program catalog + application submission.
- Stand up `services/programs-service` with health and application intake primitives.
- Add gateway proxy routes for writer-facing program discovery/applications.
- Publish initial operations manual skeleton for reviewer and cohort workflow.

## Exit Criteria

- Application intake and review are auditable and repeatable.
- Events can be scheduled with reminder delivery and attendance capture.
- Mentorship pairing and lifecycle tracking are operational.
- KPI views support leadership and partner reporting.
- Program operations have complete internal runbooks.

## Documentation Deliverables for Completion

- Program operations handbook
- Application reviewer rubric and triage guide
- Session scheduling and live-event runbook
- Mentorship operations guide
- Outcome tracking and KPI definitions
