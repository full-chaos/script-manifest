# CHAOS-1803 — Provider Verification Badges and Dispute/Refund SLA Policy

**Parent:** CHAOS-1791 (PMF Phase 1 trust primitives)
**Priority:** High
**Branch:** `feat/CHAOS-1803-provider-verification-badges-sla`
**Reserved migration number:** `029_provider_verification_and_sla.sql`
**Depends on:** CHAOS-1791 Phase 1 audit/RBAC hardening: centralized admin role checks via `resolveAdminByRole` and the existing audit table `admin_audit_log` / `AdminRepository.createAuditLogEntry` (`services/api-gateway/src/helpers.ts:218-235`, `services/identity-service/src/admin-repository.ts:36-58`, `services/identity-service/src/admin-repository.ts:358-378`).

## Goal

Make marketplace trust visible before coverage promotion by separating provider account status from public trust state, exposing a clear verified-provider badge on browse/profile surfaces, and publishing policy pages for coverage SLA, disputes, and refunds. The strategic intent is explicit in `Product Market Fit Review.md`: "Before pushing paid coverage or industry discovery" the product must "Add provider verification badges" and "Add dispute SLA and refund policy" (`Product Market Fit Review.md:238-249`), because "Trust is not documentation. Trust is visible controls" (`Product Market Fit Review.md:251`).

This plan keeps coverage secondary while making its trust prerequisites real. It should reinforce the PMF thesis that writers need a "durable, portable, transparent career record" connected to verified downstream loops (`Product Market Fit Review.md:37-40`) and avoid over-automating provider trust: "If bad providers deliver bad notes, writers blame Script Manifest, not the provider. Provider vetting cannot be mostly automated if trust is the product" (`Product Market Fit Review.md:363-365`).

## Current-state references

- Provider schema currently lives in `coverage_providers` with `status`, Stripe Connect fields, rating/counts, and no verification-specific columns (`packages/db/migrations/007_coverage_marketplace.sql:3-17`, mirrored in `packages/db/src/index.ts:1304-1322`).
- Provider creation creates a Stripe Connect account and stores `stripe_account_id`; onboarding completion can promote `status` from `pending_verification` to `active`, which is operationally coupled to payments (`services/coverage-marketplace-service/src/index.ts:193-222`, `services/coverage-marketplace-service/src/index.ts:267-300`, `services/coverage-marketplace-service/src/pgRepository.ts:112-128`).
- Admin provider review queue and review mutation exist, but service-internal handlers currently only require an auth user id; gateway routes already use centralized admin role checks (`services/coverage-marketplace-service/src/index.ts:303-362`, `services/api-gateway/src/routes/coverage.ts:84-115`).
- Coverage dispute/refund mechanics exist, including `coverage_disputes`, `coverage_dispute_events`, Stripe refunds, and admin-gateway dispute routes (`packages/db/migrations/007_coverage_marketplace.sql:97-143`, `services/coverage-marketplace-service/src/index.ts:897-1057`, `services/api-gateway/src/routes/coverage.ts:308-364`).
- Coverage browse and provider profile surfaces exist only in `apps/writer-web`; there is no `apps/industry-web` directory (`apps/writer-web/app/coverage/page.tsx:67-148`, `apps/writer-web/app/coverage/providers/[id]/page.tsx:81-180`). Defer industry-portal analytics-side work to CHAOS-1813.

## Scope (MVP)

1. **Schema** (`packages/db/migrations/029_provider_verification_and_sla.sql` — reserve only until implementation):
   - Extend `coverage_providers`:
     - `verification_state TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','verified','rejected','suspended'))`
     - `verified_at TIMESTAMPTZ`
     - `verified_by_user_id TEXT REFERENCES app_users(id)`
     - `verification_notes VARCHAR(2000)`
     - `verification_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Backfill existing providers:
     - `verification_state='unverified'` for all current rows.
     - Do **not** infer verified from `status='active'`; Stripe/onboarding activity is payment readiness, not trust verification.
   - New table `provider_verification_events`:
     - `id TEXT PRIMARY KEY`
     - `provider_id TEXT NOT NULL REFERENCES coverage_providers(id) ON DELETE CASCADE`
     - `admin_user_id TEXT NOT NULL REFERENCES app_users(id)`
     - `from_state TEXT CHECK (from_state IS NULL OR from_state IN ('unverified','verified','rejected','suspended'))`
     - `to_state TEXT NOT NULL CHECK (to_state IN ('unverified','verified','rejected','suspended'))`
     - `reason VARCHAR(2000)`
     - `checklist TEXT[] NOT NULL DEFAULT '{}'`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Indexes:
     - `idx_coverage_providers_verification_state ON coverage_providers(verification_state)`
     - `idx_coverage_providers_verified ON coverage_providers(verified_at DESC) WHERE verification_state = 'verified'`
     - `idx_provider_verification_events_provider_created ON provider_verification_events(provider_id, created_at DESC)`
     - `idx_provider_verification_events_admin_created ON provider_verification_events(admin_user_id, created_at DESC)`
   - Update `packages/db/src/index.ts` bootstrap schema to match the migration so test/dev auto-init remains consistent (`ensureCoverageMarketplaceTables` currently mirrors migration 007 at `packages/db/src/index.ts:1301-1446`).

2. **Contracts** (`packages/contracts/src/coverage.ts`; no separate coverage-provider file currently exists):
   - Add `ProviderVerificationStateSchema = z.enum(['unverified','verified','rejected','suspended'])` and exported type.
   - Add `ProviderBadgeKindSchema = z.enum(['verified_provider','unverified_provider','verification_rejected','provider_suspended'])`.
   - Add `ProviderBadgeSchema` with exact shape:
     - `kind: ProviderBadgeKindSchema`
     - `label: z.string()`
     - `description: z.string()`
     - `verifiedAt: z.string().nullable()`
   - Extend `CoverageProviderSchema` (`packages/contracts/src/coverage.ts:31-45`) with:
     - `verificationState: ProviderVerificationStateSchema`
     - `verifiedAt: z.string().nullable()`
     - `verifiedByUserId: z.string().nullable()`
     - `verificationNotes: z.string().nullable()`
     - `verificationUpdatedAt: z.string().nullable()`
     - `badge: ProviderBadgeSchema`
   - Add `ProviderVerificationRequestSchema`:
     - `state: z.enum(['verified','unverified','rejected','suspended'])`
     - `reason: z.string().max(2000).optional()`
     - `checklist: z.array(z.string().min(1).max(200)).max(30).default([])`
   - Extend provider filters to support `verificationState` so browse/admin queues can query verified/unverified providers without overloading operational `status` (`CoverageProviderFiltersSchema` is at `packages/contracts/src/coverage.ts:264-270`).
   - Add contract tests in `packages/contracts/test/coverage.test.ts` for badge derivation and request validation.

3. **Services** (`services/coverage-marketplace-service` + gateway):
   - Repository interface (`services/coverage-marketplace-service/src/repository.ts:29-38`):
     - Add `updateProviderVerification(providerId, adminUserId, input): Promise<CoverageProvider | null>`.
     - Add `createProviderVerificationEvent({ providerId, adminUserId, fromState, toState, reason, checklist }): Promise<ProviderVerificationEvent>`.
     - Add `listProviderVerificationEvents(providerId): Promise<ProviderVerificationEvent[]>`.
   - Postgres repository (`services/coverage-marketplace-service/src/pgRepository.ts`):
     - Extend provider insert/select/map rows to include new columns (`createProvider`, `getProvider`, `listProviders`, and `mapProvider`; current provider CRUD is `services/coverage-marketplace-service/src/pgRepository.ts:50-170`).
     - Implement verification mutation in a transaction: fetch current provider, update `coverage_providers`, insert `provider_verification_events`, return mapped provider.
     - Preserve Stripe Connect behavior in `updateProviderStripe`; do not let onboarding completion change `verification_state` (`services/coverage-marketplace-service/src/pgRepository.ts:112-128`).
   - Coverage service routes (`services/coverage-marketplace-service/src/index.ts`):
     - Keep existing provider review route for operational review history, but add explicit admin verification endpoints:
       - `PATCH /internal/admin/providers/:providerId/verification`
       - `GET /internal/admin/providers/:providerId/verification-events`
     - Require an authenticated admin/service actor. Gateway should pass `x-auth-user-id` plus admin service role; service-internal route should use `requireAdminServiceToken` rather than only `getAuthUserId`, mirroring the stronger dispute resolver check (`services/coverage-marketplace-service/src/index.ts:976-984`).
     - Emit both domain events (`provider_verification_events`) and central audit events using the existing Phase 1 audit pattern/table: action names `verify_provider`, `unverify_provider`, `reject_provider_verification`, `suspend_provider_verification`, `targetType='provider'`, `targetId=providerId`, details `{ fromState, toState, reason, checklist }`. Current audit persistence is `admin_audit_log` via `createAuditLogEntry` (`services/identity-service/src/admin-repository.ts:358-378`); route examples call it after privileged mutations (`services/identity-service/src/admin-routes.ts:58-81`).
     - Return `badge` on all provider reads so buyers do not derive public trust state client-side.
   - API gateway (`services/api-gateway/src/routes/coverage.ts`):
     - Add public read-through support for `verificationState` filters.
     - Add admin routes guarded by `resolveAdminByRole` (`services/api-gateway/src/routes/coverage.ts:88-115`, `services/api-gateway/src/helpers.ts:218-235`):
       - `PATCH /api/v1/coverage/admin/providers/:providerId/verification`
       - `GET /api/v1/coverage/admin/providers/:providerId/verification-events`
     - Forward admin identity using the existing admin header pattern (`addAuthUserIdHeader(..., adminId, 'admin')` is already used for dispute resolution at `services/api-gateway/src/routes/coverage.ts:337-350`).
   - Buyer read-through:
     - `GET /api/v1/coverage/providers` and `GET /api/v1/coverage/providers/:providerId` should include `badge` and verification fields.
     - `GET /api/v1/coverage/services` should either join/map provider badge state or the writer-web browse page should continue its current parallel provider lookup (`apps/writer-web/app/coverage/page.tsx:76-84`) and render badge next to provider name.

4. **UI** (`apps/writer-web`; no separate industry app exists):
   - Shared badge component:
     - New `apps/writer-web/app/coverage/components/ProviderVerificationBadge.tsx` rendering `provider.badge` with accessible text, compact and full variants.
     - Snapshot/component tests in `apps/writer-web/app/coverage/components/ProviderVerificationBadge.test.tsx` for verified, unverified, rejected/suspended admin-only copy, and null-safe rendering.
   - Coverage browse (`apps/writer-web/app/coverage/page.tsx`):
     - Insert compact badge next to provider link in service cards (`apps/writer-web/app/coverage/page.tsx:132-138`).
     - Add policy links in hero/body: `Coverage SLA`, `Dispute policy`, `Refund policy` (`apps/writer-web/app/coverage/page.tsx:92-99`).
   - Provider profile (`apps/writer-web/app/coverage/providers/[id]/page.tsx`):
     - Insert full badge near title and above specialties (`apps/writer-web/app/coverage/providers/[id]/page.tsx:83-93`).
     - Add a "Trust & policies" panel linking to SLA/dispute/refund docs before ordering services.
   - Admin verification screen:
     - New `apps/writer-web/app/admin/providers/page.tsx` listing review queue + verification state, using `/api/v1/coverage/admin/providers/review-queue` and new verification endpoints.
     - Add Providers nav item to `apps/writer-web/app/admin/layout.tsx` alongside Disputes/Audit Log (`apps/writer-web/app/admin/layout.tsx:28-39`).
     - Show latest `provider_verification_events` for the selected provider and require a reason when transitioning to `rejected` or `suspended`.
   - Do **not** add industry-portal analytics changes here; no `apps/industry-web` exists and CHAOS-1813 owns industry-user analytics.

5. **Policy docs** (`docs/`):
   - New `docs/policies/coverage-sla.md`:
     - Define provider turnaround as the service `turnaround_days`, SLA start at order claim/payment hold, deadline stored in `coverage_orders.sla_deadline` (`packages/db/migrations/007_coverage_marketplace.sql:42-60`, `services/coverage-marketplace-service/src/index.ts:666-674`).
     - Explain overdue handling and the existing SLA maintenance job route (`services/coverage-marketplace-service/src/index.ts:1220-1227`, `services/api-gateway/src/routes/coverage.ts:380-389`).
   - New `docs/policies/dispute-refund.md`:
     - Explain dispute reasons `non_delivery`, `quality`, `other` and statuses `open`, `under_review`, `resolved_refund`, `resolved_no_refund`, `resolved_partial` (`packages/db/migrations/007_coverage_marketplace.sql:97-110`).
     - Explain refund outcomes and Stripe refund/capture behavior (`services/coverage-marketplace-service/src/index.ts:1019-1045`).
   - Add writer-web links to these docs from coverage browse and provider profile. If docs are not served directly, add read-only policy pages under `apps/writer-web/app/policies/coverage-sla/page.tsx` and `apps/writer-web/app/policies/dispute-refund/page.tsx` that render the markdown content.

6. **Tests**:
   - Service unit tests:
     - `services/coverage-marketplace-service/src/index.test.ts`: admin verification endpoint accepts admin/service role, rejects missing admin role, requires reason for rejected/suspended, returns badge fields on provider reads.
     - `services/coverage-marketplace-service/src/pgRepository.test.ts`: SQL includes new verification columns, transaction inserts `provider_verification_events`, `updateProviderStripe` does not change verification state.
   - RBAC tests:
     - `services/api-gateway/src/routes/coverage.test.ts`: `resolveAdminByRole` is required for verification mutations/events; non-admin token receives 403.
     - `services/coverage-marketplace-service/src/index.test.ts`: service-internal verification mutation rejects auth-only requests without admin service role.
   - Audit tests:
     - Verify `provider_verification_events` row is created for every badge mutation.
     - Verify central `admin_audit_log` receives `targetType='provider'` and the expected action/details using the existing `createAuditLogEntry` pattern.
   - UI tests:
     - Snapshot/component tests for `ProviderVerificationBadge`.
     - Coverage browse smoke test confirms verified badge and policy links render.
     - Provider profile smoke test confirms full badge and policy links render.
     - Admin providers page test confirms verify/unverify action invalidates list and event history.
   - Policy-link smoke:
     - Next route/page tests for `/policies/coverage-sla` and `/policies/dispute-refund`, or static link checks if docs are served directly.

## Sequencing & dependencies

1. Confirm CHAOS-1791 audit/RBAC landing is present: gateway admin routes use `resolveAdminByRole`; central audit table is `admin_audit_log`; privileged audit actions are visible in `apps/writer-web/app/admin/audit-log/page.tsx` target filters (`apps/writer-web/app/admin/audit-log/page.tsx:27-37`).
2. Create migration `029_provider_verification_and_sla.sql` and update DB bootstrap schema in the same implementation task; do not add business logic until schema tests pass.
3. Extend contracts and mapping so `CoverageProvider` has verification fields and a server-derived `badge` everywhere.
4. Implement repository mutations/events and service/gateway admin endpoints behind centralized admin checks.
5. Wire central audit emission to `admin_audit_log` for every verification-state mutation; domain events are not a substitute for Phase 1 privileged audit visibility.
6. Add writer-web badge component, browse/profile insertions, admin verification screen, and policy links.
7. Add policy docs/pages last so UI links point at stable routes.

## Verification

- `pnpm --filter @script-manifest/db migrate`
  - Expected: migration 029 applies cleanly after 028; `coverage_providers` has verification columns; `provider_verification_events` exists with indexes.
- `pnpm --filter @script-manifest/contracts test -- coverage`
  - Expected: provider verification states, badge enum, and verification request validation pass.
- `pnpm --filter @script-manifest/coverage-marketplace-service test`
  - Expected: provider verification mutations, RBAC rejection, domain event insertion, Stripe onboarding non-coupling, and read badge serialization pass.
- `pnpm --filter @script-manifest/api-gateway test -- coverage`
  - Expected: admin verification endpoints require `resolveAdminByRole`, forward admin identity, and reject non-admin users.
- `pnpm --filter @script-manifest/writer-web test -- coverage admin/providers policies`
  - Expected: browse/provider profile badges render; admin verification screen works; policy links/pages smoke pass.
- Manual smoke against local stack:
  - Create provider, complete Stripe onboarding, confirm public badge remains unverified.
  - Admin verifies provider, confirm `provider_verification_events` row + `admin_audit_log` row + verified badge on browse/profile.
  - Admin unverifies/suspends provider, confirm badge state updates and reason is recorded.
  - Open coverage browse/profile policy links and confirm SLA/dispute/refund copy is reachable.

## Risks & open questions

- **Audit integration boundary:** central audit persistence currently lives in identity-service `AdminRepository`, while coverage service owns provider mutations. Implementation must either call an existing internal audit route or add a small shared/internal audit client; do not silently rely only on `provider_verification_events`.
- **Status vs verification state:** existing `status='active'` is tied to Stripe onboarding and service creation (`services/coverage-marketplace-service/src/index.ts:380-382`). Keep it distinct from `verification_state` so payment readiness never implies trust verification.
- **Rejected/suspended visibility:** public browse should probably hide rejected/suspended providers even if services are active; admin screens should still show them. Decide exact buyer-facing copy before implementation.
- **Policy authority:** docs need product/legal review before public promotion; implementation can ship copy but should mark it as operational policy requiring final owner approval.
- **Direct docs serving:** if Next cannot serve `docs/` markdown directly, add `apps/writer-web/app/policies/*` pages that render the same policy text and keep `docs/` as source of record.
- **No industry overlap:** do not add industry analytics or industry-user verification flows here; CHAOS-1813 owns industry-user analytics and any industry-side expansion.

## Linear sub-issue breakdown

- **[S] Schema: Add provider verification columns and domain event table** — Acceptance: migration `029_provider_verification_and_sla.sql` extends `coverage_providers`, creates `provider_verification_events`, adds all four indexes, backfills existing rows to `unverified`, and DB bootstrap mirrors the migration.
- **[S] Contracts: Add provider verification states and badge contracts** — Acceptance: `packages/contracts/src/coverage.ts` exports `ProviderVerificationStateSchema`, `ProviderBadgeKindSchema`, `ProviderBadgeSchema`, `ProviderVerificationRequestSchema`; `CoverageProviderSchema` includes verification fields and `badge`; contract tests cover valid/invalid payloads.
- **[M] Repository: Persist provider verification mutations and events** — Acceptance: repository interface + Postgres implementation update provider verification state in a transaction, insert `provider_verification_events`, list event history, and never couple Stripe onboarding to verification state.
- **[M] Service/API: Add admin verify/unverify endpoints behind RBAC** — Acceptance: coverage service exposes internal verification endpoints, API gateway exposes admin routes guarded by `resolveAdminByRole`, non-admin requests fail with 403, rejected/suspended transitions require a reason.
- **[M] Audit: Emit central privileged audit records for badge mutations** — Acceptance: every verification-state change writes `admin_audit_log` with provider target/action/details and is visible/filterable in the existing admin audit log UI.
- **[S] Buyer reads: Return server-derived provider badge state** — Acceptance: provider list/detail responses include `badge`; coverage services/browse can display provider badge without client-side trust derivation; tests cover verified and unverified providers.
- **[M] UI: Add verified-provider badges to browse and profile** — Acceptance: shared `ProviderVerificationBadge` component has snapshot tests; coverage browse cards and provider profile show the badge; policy links are visible on both surfaces.
- **[M] UI: Add admin provider verification screen** — Acceptance: `/admin/providers` lists provider review/verification queue, can verify/unverify/reject/suspend with reason/checklist, shows event history, and invalidates SWR cache after mutation.
- **[S] Policy docs: Publish coverage SLA and dispute/refund policy** — Acceptance: `docs/policies/coverage-sla.md` and `docs/policies/dispute-refund.md` exist with SLA start/deadline/refund/dispute statuses; writer-web routes or links expose both docs from browse/profile.
- **[M] Tests: Add service, RBAC, audit, UI, and policy-link coverage** — Acceptance: coverage-marketplace-service, api-gateway, contracts, and writer-web targeted test commands pass; manual smoke confirms badge mutation emits domain + central audit events and updates public surfaces.
