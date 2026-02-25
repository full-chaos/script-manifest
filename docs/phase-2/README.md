# Phase 2: Paid Coverage Marketplace

Status: In Progress (execution tracked in `CHAOS-322`)

## Goal

Launch paid professional coverage with provider onboarding, service listings, escrow-like payment holds, delivery, ratings, and dispute handling.

## Current Implementation

- Service: `services/coverage-marketplace-service`
- Gateway routes: `services/api-gateway/src/routes/coverage.ts`
- Writer web surface: `apps/writer-web/app/coverage`
- Contracts: `packages/contracts/src/index.ts` (coverage schemas)

## Key Capabilities Present

- Provider lifecycle: create, update, stripe onboarding link
- Provider vetting workflow: admin review queue, approve/reject/suspend actions, checklist + reason capture
- Service catalog: create/list/update coverage services
- Order lifecycle: create, claim, deliver, complete, cancel
- SLA automation: maintenance job endpoint for auto-complete + SLA-breach dispute opening
- Delivery and review handling
- Delivery upload session endpoint for provider report attachments
- Dispute opening and admin resolution with audit events and partial/full refund handling
- Provider earnings statement export (JSON/CSV)
- Admin payout ledger export (JSON/CSV)
- Stripe webhook ingestion route

## Primary Design References

- `docs/plans/2026-02-16-coverage-marketplace.md`
- `docs/plans/2026-02-16-coverage-marketplace-design.md`

## Documentation Gaps Remaining

- Provider vetting operations runbook (queue triage + decision criteria)
- Finance runbook (monthly ledger export + tax workflow/1099 handling)
- SLA maintenance scheduling guide (recommended cron cadence and alerting)
