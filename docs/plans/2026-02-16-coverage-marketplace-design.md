# Phase 2: Paid Coverage Marketplace — Design

**Date**: 2026-02-16
**Status**: Approved
## Overview

A marketplace where writers purchase professional script coverage from vetted providers. First revenue-generating feature. Introduces Stripe Connect for real payments with escrow, provider payouts, and platform commission.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Single new service (`coverage-marketplace-service`, port 4008) | Mirrors feedback-exchange pattern, avoids premature extraction of payment service |
| Payments | Full Stripe Connect | Real escrow, provider payouts, platform commission from day one |
| Provider vetting | Auto-approve with Stripe verification | Providers self-register, auto-approved once Stripe identity/payment verified. Ratings surface quality. |
| Delivery format | Structured form + file upload | Maximum flexibility — provider fills structured fields AND can upload PDF/DOCX via MinIO |
| Disputes | Platform admin arbitration | Disputes go to admin queue for review. Gated by `ADMIN_USER_IDS` env var. |
| Platform commission | 15% (configurable via env var) | `PLATFORM_COMMISSION_RATE=0.15` |

## Data Model

### coverage_providers

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `cprov_<nanoid>` |
| user_id | TEXT UNIQUE NOT NULL | One provider per user |
| display_name | TEXT | Professional name |
| bio | TEXT | Background, credentials |
| specialties | TEXT[] | Genres/formats |
| status | TEXT | `pending_verification` / `active` / `suspended` / `deactivated` |
| stripe_account_id | TEXT | Stripe Connect account ID |
| stripe_onboarding_complete | BOOLEAN | Completed Stripe onboarding |
| avg_rating | NUMERIC(3,2) | Cached average |
| total_orders_completed | INTEGER | Counter cache |
| created_at / updated_at | TIMESTAMPTZ | |

### coverage_services

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `csvc_<nanoid>` |
| provider_id | TEXT FK | → coverage_providers |
| title | TEXT | Service name |
| description | TEXT | What's included |
| tier | TEXT | `concept_notes` / `early_draft` / `polish_proofread` / `competition_ready` |
| price_cents | INTEGER | Price in cents |
| currency | TEXT | Default `usd` |
| turnaround_days | INTEGER | Expected delivery time |
| max_pages | INTEGER | Page limit |
| active | BOOLEAN | Toggle visibility |
| created_at / updated_at | TIMESTAMPTZ | |

### coverage_orders

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `cord_<nanoid>` |
| writer_user_id | TEXT NOT NULL | Buyer |
| provider_id | TEXT FK | → coverage_providers |
| service_id | TEXT FK | → coverage_services |
| script_id | TEXT | Script being covered |
| project_id | TEXT | Parent project |
| status | TEXT | State machine (see below) |
| price_cents | INTEGER | Locked at order time |
| platform_fee_cents | INTEGER | Commission |
| provider_payout_cents | INTEGER | Provider receives |
| stripe_payment_intent_id | TEXT | Stripe PI |
| stripe_transfer_id | TEXT | Stripe transfer to provider |
| sla_deadline | TIMESTAMPTZ | turnaround_days from claim |
| delivered_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

### coverage_deliveries

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `cdel_<nanoid>` |
| order_id | TEXT FK UNIQUE | → coverage_orders |
| summary | TEXT | Overall assessment |
| strengths | TEXT | What works |
| weaknesses | TEXT | Areas for improvement |
| recommendations | TEXT | Specific suggestions |
| score | INTEGER | 1-100, feeds ranking algorithm |
| file_key | TEXT | MinIO object key |
| file_name | TEXT | Original filename |
| created_at | TIMESTAMPTZ | |

### coverage_reviews

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `crev_<nanoid>` |
| order_id | TEXT FK UNIQUE | → coverage_orders |
| writer_user_id | TEXT | Reviewer |
| provider_id | TEXT FK | → coverage_providers |
| rating | INTEGER | 1-5 stars |
| comment | TEXT | Written review |
| created_at | TIMESTAMPTZ | |

### coverage_disputes

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | `cdis_<nanoid>` |
| order_id | TEXT FK | → coverage_orders |
| opened_by_user_id | TEXT | Filer |
| reason | TEXT | `non_delivery` / `quality` / `other` |
| description | TEXT | Explanation |
| status | TEXT | `open` / `under_review` / `resolved_refund` / `resolved_no_refund` / `resolved_partial` |
| admin_notes | TEXT | Decision rationale |
| refund_amount_cents | INTEGER | If partial/full refund |
| resolved_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

## Order State Machine

```
placed → payment_held → claimed → in_progress → delivered → completed
                                                           ↘ disputed → resolved
                                        (sla_expired) ----↗
         payment_failed (terminal)
         cancelled (terminal, before claimed)
         refunded (terminal, after dispute)
```

- **placed**: Writer submits order, Stripe PaymentIntent created
- **payment_held**: Stripe confirms capture (webhook)
- **claimed**: Provider acknowledges, SLA clock starts
- **in_progress**: Provider working (optional UI status)
- **delivered**: Provider submits delivery
- **completed**: Writer confirms or auto-completes after 7 days → triggers payout transfer
- **disputed**: Writer opens dispute → admin arbitration → refund or no refund

## Service Architecture

### coverage-marketplace-service (port 4008)

**Dependencies**: PostgreSQL, MinIO (presigned URLs), Stripe SDK, Notification service

**Pattern**: `buildServer(options)` with DI — `CoverageMarketplaceRepository` interface + `PgCoverageMarketplaceRepository` / `MemoryCoverageMarketplaceRepository`. `PaymentGateway` interface + `StripePaymentGateway` / `MemoryPaymentGateway`.

### PaymentGateway Interface

```typescript
interface PaymentGateway {
  createConnectAccount(providerId: string, email: string): Promise<{ accountId: string; onboardingUrl: string }>;
  createPaymentIntent(order: { amountCents: number; currency: string; providerStripeAccountId: string }): Promise<{ intentId: string; clientSecret: string }>;
  capturePayment(intentId: string): Promise<void>;
  transferToProvider(order: { intentId: string; amountCents: number; stripeAccountId: string }): Promise<{ transferId: string }>;
  refund(intentId: string, amountCents?: number): Promise<{ refundId: string }>;
}
```

### Internal API Routes

**Providers**: POST/GET/PATCH `/internal/providers`, GET `/internal/providers/:id/stripe-onboarding`
**Services**: CRUD on `/internal/providers/:providerId/services`, GET `/internal/services` (browse)
**Orders**: POST/GET `/internal/orders`, POST `/internal/orders/:id/{claim,deliver,complete,cancel}`
**Delivery**: GET `/internal/orders/:id/delivery`, GET `/internal/orders/:id/delivery/upload-url`
**Reviews**: POST `/internal/orders/:id/review`, GET `/internal/providers/:id/reviews`
**Disputes**: POST `/internal/orders/:id/dispute`, GET/PATCH `/internal/disputes`
**Webhooks**: POST `/internal/stripe-webhook` (raw body for signature verification)
**Health**: GET `/health`, `/health/live`, `/health/ready`

### Gateway Integration

New file `services/api-gateway/src/routes/coverage.ts` mapping `/api/v1/coverage/*` → upstream. Standard auth pattern. Stripe webhook route passes raw body without JSON parsing.

## Frontend

### Pages

| Route | Purpose |
|-------|---------|
| `/coverage` | Marketplace browse — provider grid with filters |
| `/coverage/providers/[id]` | Provider profile, services, reviews |
| `/coverage/order/[serviceId]` | Order flow with Stripe Elements payment |
| `/coverage/orders/[id]` | Order detail with status timeline, delivery, review |
| `/coverage/dashboard` | Provider dashboard — orders, earnings |
| `/coverage/become-provider` | Provider onboarding + Stripe Connect |
| `/coverage/admin/disputes` | Admin dispute resolution queue |

### Components

- `ProviderCard` — marketplace grid item
- `OrderTimeline` — status progression
- `ServiceTierBadge` — tier indicator
- Stripe Elements wrapper for payment form
- Reuse: Skeletons, Toast, existing form patterns

### Admin Access

Gated by `ADMIN_USER_IDS` env var (comma-separated user IDs). Proper RBAC deferred to later phase.

## Environment Variables

```
COVERAGE_SERVICE_PORT=4008
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
PLATFORM_COMMISSION_RATE=0.15
ADMIN_USER_IDS=user1,user2
MINIO_ENDPOINT=http://localhost:9000
```
