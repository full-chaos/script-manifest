# Phase 2: Paid Coverage Marketplace

Status: Implemented (feature `script-manifest-612` closed)

## Goal

Launch paid professional coverage with provider onboarding, service listings, escrow-like payment holds, delivery, ratings, and dispute handling.

## Current Implementation

- Service: `services/coverage-marketplace-service`
- Gateway routes: `services/api-gateway/src/routes/coverage.ts`
- Writer web surface: `apps/writer-web/app/coverage`
- Contracts: `packages/contracts/src/index.ts` (coverage schemas)

## Key Capabilities Present

- Provider lifecycle: create, update, stripe onboarding link
- Service catalog: create/list/update coverage services
- Order lifecycle: create, claim, deliver, complete, cancel
- Delivery and review handling
- Dispute opening and admin resolution
- Stripe webhook ingestion route

## Primary Design References

- `docs/plans/2026-02-16-coverage-marketplace.md`
- `docs/plans/2026-02-16-coverage-marketplace-design.md`

## Documentation Gaps Remaining

- Provider onboarding user manual
- Coverage order state-machine user manual
- Admin dispute runbook

