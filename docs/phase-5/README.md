# Phase 5: Industry Portal and Discovery Dashboard

Status: In Progress (feature `script-manifest-n92`)
External ref: `CHAOS-352`

## Objective

Build the B2B industry portal that lets vetted industry users discover writers/projects, download scripts with auditability, collaborate in shared workspaces, and run mandate/OWA pipelines.

## Scope

In scope:
- Industry account registration and manual credential vetting
- Writer discovery search with rich filters
- Script download with writer-controlled permissions and download notifications
- Industry team lists and shared notes
- Writer and industry analytics
- Mandate and OWA board with editorial review/forwarding workflow
- Weekly recommendation digest (manual first, algorithm-assisted later)

Out of scope for this phase:
- Fully autonomous recommendation engine
- Fully automated vetting (manual verification remains required)

## Beads Breakdown

- `script-manifest-n92.1`: Industry account verification and access control
- `script-manifest-n92.2`: Discovery search and team collaboration workspace
- `script-manifest-n92.3`: Mandate workflows and recommendation operations

## Architecture and Technology Choices

### Deployables

| Deployable | Location | Responsibility |
| --- | --- | --- |
| Industry web app (new) | `apps/industry-web` | Industry-facing UI for search, lists, notes, mandates |
| Writer app integration (existing) | `apps/writer-web` | Writer controls for access grants and analytics visibility |
| Industry portal service (new) | `services/industry-portal-service` | Vetting, search, lists, notes, mandates, analytics read model |
| API gateway routes (new) | `services/api-gateway/src/routes/industry.ts` | Auth + proxy layer for industry APIs |
| Search indexer extension (existing) | `services/search-indexer-service` | Talent index writes/updates for filterable discovery |
| Notification service extension (existing) | `services/notification-service` | Download alerts and digest delivery |
| Contracts extension | `packages/contracts/src/index.ts` | Industry schemas, payloads, filters |
| DB migrations | `packages/db/src/migrations` | Industry accounts, entitlements, lists/notes, mandates, analytics snapshots |

### Core Infrastructure Choices

- PostgreSQL remains system of record for industry accounts, permissions, mandates, and collaboration artifacts.
- OpenSearch remains the search engine for talent discovery and filter-heavy ranking queries.
- Event-driven audit events continue over existing platform event flows for downloads and access decisions.
- Notification pipeline remains centralized in notification-service for writer alerts and digest delivery.

## Planned Data Model Additions

- `industry_accounts`
- `industry_vetting_reviews`
- `industry_entitlements`
- `industry_download_audit`
- `industry_lists`
- `industry_list_items`
- `industry_notes`
- `industry_teams`
- `industry_team_members`
- `mandates`
- `mandate_submissions`
- `owa_submissions`
- `industry_digest_runs`

## Planned API Surface

Gateway namespace:
- `POST /api/v1/industry/accounts`
- `POST /api/v1/industry/accounts/:accountId/verify`
- `GET /api/v1/industry/talent-search`
- `POST /api/v1/industry/scripts/:scriptId/download`
- `GET /api/v1/industry/lists`
- `POST /api/v1/industry/lists`
- `POST /api/v1/industry/lists/:listId/items`
- `POST /api/v1/industry/lists/:listId/notes`
- `GET /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates`
- `POST /api/v1/industry/mandates/:mandateId/submissions`
- `GET /api/v1/industry/analytics`

## Job and Event Plan

- Digest builder job (weekly)
- Download audit aggregation job (hourly)
- Mandate expiry and reminder job (daily)
- Entitlement integrity checker (daily)
- Events:
  - `industry_script_downloaded`
  - `industry_account_verified`
  - `mandate_submission_forwarded`

## Milestones

1. Access and vetting foundation (`script-manifest-n92.1`)
2. Search + collaboration workspace (`script-manifest-n92.2`)
3. Mandates + recommendation ops (`script-manifest-n92.3`)
4. Hardening, analytics validation, and user docs

## Current Implementation (n92.1 Foundation)

Implemented in `codex/phase-5-industry-portal-foundation`:

- New deployable:
  - `services/industry-portal-service`
- New gateway routing surface:
  - `services/api-gateway/src/routes/industry.ts`
- New contract schemas:
  - `packages/contracts/src/index.ts` (industry account + entitlement schemas)
- New DB table provisioning:
  - `packages/db/src/index.ts` (`ensureIndustryPortalTables`)

Initial internal service endpoints:

- `POST /internal/accounts` (industry account application)
- `GET /internal/accounts/:accountId`
- `POST /internal/accounts/:accountId/verify` (manual reviewer action)
- `PUT /internal/entitlements/:writerUserId` (writer-controlled access grant)
- `GET /internal/entitlements/:writerUserId/check` (view/download entitlement check)

Initial gateway endpoints:

- `POST /api/v1/industry/accounts`
- `GET /api/v1/industry/accounts/:accountId`
- `POST /api/v1/industry/accounts/:accountId/verify`
- `PUT /api/v1/industry/entitlements/:writerUserId`
- `GET /api/v1/industry/entitlements/:writerUserId/check`

## Exit Criteria

- Industry users can be manually vetted and segmented by account tier.
- Search supports role-critical filters with acceptable latency.
- Every script download is permission-checked and writer-notified.
- Mandate/OWA flows support submission, editorial review, and forwarding.
- Core operations have runbooks and user-facing documentation.

## Documentation Deliverables for Completion

- Industry onboarding and vetting manual
- Writer access-control manual (industry visibility)
- Mandate and OWA operations runbook
- Weekly digest curation SOP

Current draft:

- `docs/phase-5/industry-vetting-and-access-user-manual.md`
