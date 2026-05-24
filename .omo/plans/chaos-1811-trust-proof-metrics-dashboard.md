# CHAOS-1811 — Public Trust Proof Metrics Dashboard

**Parent:** CHAOS-1793
**Priority:** High
**Branch:** `feat/CHAOS-1811-trust-proof-metrics-dashboard`
**Reserved migration number:** `030_trust_proof_metrics.sql`
**Depends on:** CHAOS-1805 (`placement_evidence` + historical placement review fields), CHAOS-1807 (`saved_competitions`), CHAOS-1791 (writer data export coverage), CHAOS-1809 (`script_view_events` from `028_resume_share_metrics.sql` if merged before this work)

## Goal

Ship an in-product public `/trust` proof page and internal admin read-through showing refreshed trust metrics for hosted public scripts, recorded and verified placements, tracked competitions, export usage/readiness, and verified industry downloads.

## Scope (MVP)

1. **Schema** (`packages/db/migrations/030_trust_proof_metrics.sql`):
   - Create an aggregate snapshot table, not a materialized view:

     ```sql
     CREATE TABLE IF NOT EXISTS trust_proof_metrics_snapshot (
       id TEXT PRIMARY KEY,
       snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       scripts_hosted_total INTEGER NOT NULL DEFAULT 0,
       placements_recorded_total INTEGER NOT NULL DEFAULT 0,
       placements_verified_total INTEGER NOT NULL DEFAULT 0,
       competitions_tracked_total INTEGER NOT NULL DEFAULT 0,
       exports_generated_total INTEGER NOT NULL DEFAULT 0,
       verified_industry_downloads_total INTEGER NOT NULL DEFAULT 0,
       writers_exportable_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
       source_scripts_max_updated_at TIMESTAMPTZ,
       source_placements_max_updated_at TIMESTAMPTZ,
       source_competitions_max_saved_at TIMESTAMPTZ,
       source_exports_max_generated_at TIMESTAMPTZ,
       source_downloads_max_downloaded_at TIMESTAMPTZ,
       source_writers_max_updated_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );

     CREATE INDEX IF NOT EXISTS trust_proof_metrics_snapshot_latest_idx
       ON trust_proof_metrics_snapshot(snapshot_at DESC);
     ```

   - Decision: use a snapshot table instead of a materialized view because product wants historical trend points for chart-light, safe partial/blocker annotations can be stored by the service layer, and inserts avoid `REFRESH MATERIALIZED VIEW` locking/extension assumptions.
   - Refresh strategy: scheduled Fastify job inside a new `metrics-service`, every 15 minutes, plus an admin-only on-demand refresh endpoint. Justification: app-owned scheduling is testable, avoids requiring `pg_cron`, and keeps this metric-specific workflow out of `search-sync-worker`, whose current responsibility is Typesense search consumption.

2. **Contracts** (`packages/contracts/src/trust-proof-metrics.ts` NEW):
   - Export from `packages/contracts/src/index.ts`.
   - `TrustProofMetricsSchema`:

     ```ts
     export const TrustProofMetricsSchema = z.object({
       snapshotAt: z.string().datetime({ offset: true }),
       scriptsHostedTotal: z.number().int().nonnegative(),
       placementsRecordedTotal: z.number().int().nonnegative(),
       placementsVerifiedTotal: z.number().int().nonnegative(),
       competitionsTrackedTotal: z.number().int().nonnegative(),
       exportsGeneratedTotal: z.number().int().nonnegative(),
       verifiedIndustryDownloadsTotal: z.number().int().nonnegative(),
       writersExportablePct: z.number().min(0).max(100),
       sourceDataStamps: z.object({
         scriptsMaxUpdatedAt: z.string().datetime({ offset: true }).nullable(),
         placementsMaxUpdatedAt: z.string().datetime({ offset: true }).nullable(),
         competitionsMaxSavedAt: z.string().datetime({ offset: true }).nullable(),
         exportsMaxGeneratedAt: z.string().datetime({ offset: true }).nullable(),
         downloadsMaxDownloadedAt: z.string().datetime({ offset: true }).nullable(),
         writersMaxUpdatedAt: z.string().datetime({ offset: true }).nullable()
       })
     });
     ```

   - Public response: `TrustProofMetricsPublicResponseSchema = z.object({ metrics: TrustProofMetricsSchema.pick({ snapshotAt: true, scriptsHostedTotal: true, placementsRecordedTotal: true, placementsVerifiedTotal: true, competitionsTrackedTotal: true, exportsGeneratedTotal: true, verifiedIndustryDownloadsTotal: true, writersExportablePct: true }) })`.
   - Internal admin response: `TrustProofMetricsAdminResponseSchema = z.object({ metrics: TrustProofMetricsSchema, refresh: z.object({ refreshedAt: z.string().datetime({ offset: true }), cacheTtlSeconds: z.number().int(), warnings: z.array(z.object({ metric: z.string(), reason: z.string() })) }) })`.

3. **Aggregation SQL** (actual source table names verified from migrations/services):
   - `scripts_hosted_total` → `scripts` from `packages/db/migrations/017_script_storage.sql`, visibility widened by `024_placement_evidence.sql`:

     ```sql
     SELECT COUNT(*)::int AS scripts_hosted_total,
            MAX(updated_at) AS source_scripts_max_updated_at
     FROM scripts
     WHERE visibility = 'public';
     ```

   - `placements_recorded_total` → actual table is `placements`, not `submission_placements` (`packages/db/migrations/008_submission_tracking.sql`):

     ```sql
     SELECT COUNT(*)::int AS placements_recorded_total,
            MAX(updated_at) AS source_placements_max_updated_at
     FROM placements;
     ```

   - `placements_verified_total` → same `placements` table, verified by `verification_state`:

     ```sql
     SELECT COUNT(*)::int AS placements_verified_total,
            MAX(updated_at) FILTER (WHERE verification_state = 'verified') AS source_verified_placements_max_updated_at
     FROM placements
     WHERE verification_state = 'verified';
     ```

   - `placement_evidence` shape from CHAOS-1805 / migration `024_placement_evidence.sql`: `placement_evidence(id, placement_id, script_id, evidence_url, kind, caption, uploaded_by_user_id, created_at, updated_at)` plus `placements.is_historical`, `source_note`, `recorded_by_user_id`, `reviewed_by_user_id`, `reviewed_at`, `review_notes`. The trust dashboard does not count evidence rows directly in MVP, but verified placement admin drill-down should link this table for auditability.
   - `competitions_tracked_total` → `saved_competitions` from CHAOS-1807 / migration `026_saved_competitions.sql`:

     ```sql
     SELECT COUNT(*)::int AS competitions_tracked_total,
            MAX(saved_at) AS source_competitions_max_saved_at
     FROM saved_competitions;
     ```

   - `exports_generated_total` → BLOCKED for exact event count. Existing export endpoints are `services/api-gateway/src/routes/export.ts` (`GET /api/v1/export/csv`, `GET /api/v1/export/zip`) and `onboarding_progress.export_used` exists, but no export event/audit table was found in migrations or service code. MVP must add instrumentation under this plan before this metric can be exact:

     ```sql
     -- Requires sub-issue CHAOS-1811-A to create writer_export_events.
     SELECT COUNT(*)::int AS exports_generated_total,
            MAX(generated_at) AS source_exports_max_generated_at
     FROM writer_export_events
     WHERE status = 'generated';
     ```

     Proposed table in `030_trust_proof_metrics.sql` to unblock the metric:

     ```sql
     CREATE TABLE IF NOT EXISTS writer_export_events (
       id TEXT PRIMARY KEY,
       writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
       format TEXT NOT NULL CHECK (format IN ('csv', 'zip')),
       status TEXT NOT NULL CHECK (status IN ('generated', 'failed')),
       generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       request_id TEXT
     );

     CREATE INDEX IF NOT EXISTS writer_export_events_generated_idx
       ON writer_export_events(generated_at DESC)
       WHERE status = 'generated';
     ```

   - `verified_industry_downloads_total` → actual durable source is `industry_download_audit` from `packages/db/migrations/003_industry_portal.sql`, recorded by `services/industry-portal-service/src/repository.ts::recordScriptDownload`, joined to verified `industry_accounts`. There is no table named `script_download_events`; `script_view_events` exists from `028_resume_share_metrics.sql` with `event_type IN ('view','download')`, but industry download authorization/audit lives in `industry_download_audit`.

     ```sql
     SELECT COUNT(*)::int AS verified_industry_downloads_total,
            MAX(ida.downloaded_at) AS source_downloads_max_downloaded_at
     FROM industry_download_audit ida
     JOIN industry_accounts ia ON ia.id = ida.industry_account_id
     WHERE ia.verification_status = 'verified';
     ```

     Optional reconciliation check for script-storage download event parity after CHAOS-1809:

     ```sql
     SELECT COUNT(*)::int AS script_storage_download_events_total,
            MAX(occurred_at) AS script_storage_downloads_max_occurred_at
     FROM script_view_events
     WHERE event_type = 'download';
     ```

   - `writers_exportable_pct` → derived from CHAOS-1791 export coverage. Current export route composes profile, projects, submissions, and placements for any authenticated writer; no per-writer coverage table exists. MVP should report capability coverage over writer accounts and treat the value as 100% only once export event instrumentation and contract tests prove both CSV and ZIP routes are available:

     ```sql
     WITH writer_population AS (
       SELECT au.id AS writer_id, GREATEST(au.created_at, COALESCE(wp.updated_at, au.created_at)) AS last_writer_update
       FROM app_users au
       LEFT JOIN writer_profiles wp ON wp.writer_id = au.id
       WHERE au.role = 'writer'
     ), export_capability AS (
       SELECT writer_id, TRUE AS csv_exportable, TRUE AS zip_exportable, last_writer_update
       FROM writer_population
     )
     SELECT COALESCE(
              ROUND(100.0 * COUNT(*) FILTER (WHERE csv_exportable AND zip_exportable) / NULLIF(COUNT(*), 0), 2),
              0
            ) AS writers_exportable_pct,
            MAX(last_writer_update) AS source_writers_max_updated_at
     FROM export_capability;
     ```

   - Full refresh insert composed from those metric queries:

     ```sql
     INSERT INTO trust_proof_metrics_snapshot (
       id,
       snapshot_at,
       scripts_hosted_total,
       placements_recorded_total,
       placements_verified_total,
       competitions_tracked_total,
       exports_generated_total,
       verified_industry_downloads_total,
       writers_exportable_pct,
       source_scripts_max_updated_at,
       source_placements_max_updated_at,
       source_competitions_max_saved_at,
       source_exports_max_generated_at,
       source_downloads_max_downloaded_at,
       source_writers_max_updated_at
     )
     WITH
       script_metric AS (
         SELECT COUNT(*)::int AS value, MAX(updated_at) AS stamp
         FROM scripts
         WHERE visibility = 'public'
       ),
       placement_metric AS (
         SELECT COUNT(*)::int AS recorded,
                COUNT(*) FILTER (WHERE verification_state = 'verified')::int AS verified,
                MAX(updated_at) AS stamp
         FROM placements
       ),
       competition_metric AS (
         SELECT COUNT(*)::int AS value, MAX(saved_at) AS stamp
         FROM saved_competitions
       ),
       export_metric AS (
         SELECT COUNT(*) FILTER (WHERE status = 'generated')::int AS value,
                MAX(generated_at) FILTER (WHERE status = 'generated') AS stamp
         FROM writer_export_events
       ),
       download_metric AS (
         SELECT COUNT(*)::int AS value, MAX(ida.downloaded_at) AS stamp
         FROM industry_download_audit ida
         JOIN industry_accounts ia ON ia.id = ida.industry_account_id
         WHERE ia.verification_status = 'verified'
       ),
       writer_population AS (
         SELECT au.id AS writer_id,
                GREATEST(au.created_at, COALESCE(wp.updated_at, au.created_at)) AS stamp
         FROM app_users au
         LEFT JOIN writer_profiles wp ON wp.writer_id = au.id
         WHERE au.role = 'writer'
       ),
       exportable_metric AS (
         SELECT COALESCE(ROUND(100.0 * COUNT(*) / NULLIF(COUNT(*), 0), 2), 0) AS value,
                MAX(stamp) AS stamp
         FROM writer_population
       )
     SELECT
       'tpm_' || replace(gen_random_uuid()::text, '-', ''),
       NOW(),
       script_metric.value,
       placement_metric.recorded,
       placement_metric.verified,
       competition_metric.value,
       export_metric.value,
       download_metric.value,
       exportable_metric.value,
       script_metric.stamp,
       placement_metric.stamp,
       competition_metric.stamp,
       export_metric.stamp,
       download_metric.stamp,
       exportable_metric.stamp
     FROM script_metric, placement_metric, competition_metric, export_metric, download_metric, exportable_metric;
     ```

     If `pgcrypto`/`gen_random_uuid()` is not already guaranteed in the DB, generate the `id` in `metrics-service` instead and pass it as `$1`.

4. **Service**:
   - Create a lightweight `services/metrics-service` rather than mounting all aggregation logic in `api-gateway`.
   - Ownership decision: `metrics-service` owns SQL aggregation, snapshot reads, scheduled refresh, admin refresh, and public/admin internal endpoints. `api-gateway` only proxies/authenticates. Justification: this keeps `api-gateway` from becoming a query/service orchestration layer and gives snapshot refresh a natural home.
   - Internal endpoints:
     - `GET /internal/trust-proof-metrics/public` — no user data, returns latest snapshot public response.
     - `GET /internal/admin/trust-proof-metrics` — admin-only via `x-auth-user-role=admin`, returns latest snapshot plus source stamps/warnings.
     - `POST /internal/admin/trust-proof-metrics/refresh` — admin-only, runs refresh insert once, returns new admin response.
   - Gateway routes:
     - `GET /api/v1/trust-proof-metrics` → public proxy to metrics-service.
     - `GET /api/v1/admin/trust-proof-metrics` → admin-authenticated proxy.
     - `POST /api/v1/admin/trust-proof-metrics/refresh` → admin-authenticated proxy.

5. **Public UI**:
   - New server-rendered writer-web page: `apps/writer-web/app/trust/page.tsx` at `/trust`.
   - Layout:
     - Hero: “Proof the marketplace is earning trust” with `snapshotAt` freshness.
     - Counter grid: hosted scripts, recorded placements, verified placements, tracked competitions, generated exports, verified industry downloads, writer exportable percentage.
     - Chart-light: small accessible trend strip using the last 12 snapshots if the public endpoint exposes `history` in a follow-up; MVP can show a static “Last refreshed” freshness rail from `sourceDataStamps` only on admin.
     - Trust copy beneath each metric explaining source and anti-inflation rule.
   - Accessibility/SEO:
     - Server Component fetches public metrics with `next: { revalidate: 300 }`.
     - Semantic `<dl>` for counters, visible labels, `aria-describedby` source explanations, no color-only deltas.
     - `generateMetadata()` title/description/OG tags for public previews.

6. **Internal admin UI**:
   - Extend existing admin surface (`apps/writer-web/app/admin/page.tsx`) and add a dedicated detail page `apps/writer-web/app/admin/trust-metrics/page.tsx` linked from `apps/writer-web/app/admin/layout.tsx`.
   - Dashboard card: compact current public metrics and last refresh age.
   - Detail page: full metric grid, source stamps, warnings for blocked/missing sources, manual refresh button, and source SQL notes.
   - Existing admin metrics proxy is `apps/writer-web/app/api/v1/admin/metrics/route.ts`; add parallel proxy `apps/writer-web/app/api/v1/admin/trust-proof-metrics/route.ts`.

7. **Tests**:
   - Aggregation correctness fixtures:
     - Seed `scripts` with `public`, `private`, `approved_only`, `evidence`; expect only public count.
     - Seed `placements` with verified/pending/rejected; expect recorded all, verified only verified.
     - Seed `saved_competitions`; expect total saved rows.
     - Seed `industry_accounts` verified/rejected and `industry_download_audit`; expect only downloads by verified industry accounts.
     - Seed `writer_export_events`; expect generated only, not failed.
   - Snapshot refresh test: invoking repository refresh inserts exactly one `trust_proof_metrics_snapshot` row with source stamps populated where source rows exist.
   - Public endpoint contract test: `GET /api/v1/trust-proof-metrics` returns `TrustProofMetricsPublicResponseSchema` and hides source stamps/admin warnings.
   - Admin endpoint contract test: `GET /api/v1/admin/trust-proof-metrics` rejects non-admin, returns `TrustProofMetricsAdminResponseSchema` for admin.
   - UI tests: `/trust` renders counters as labeled text; `/admin/trust-metrics` shows refresh button and source stamps.

## Sequencing & Dependencies

1. Land `030_trust_proof_metrics.sql` with `trust_proof_metrics_snapshot` and `writer_export_events` (instrumentation required because no export event table exists today).
2. Add `packages/contracts/src/trust-proof-metrics.ts` and export it.
3. Add `services/metrics-service` repository with the refresh SQL and latest snapshot reads.
4. Add scheduled refresh in `metrics-service` (`setInterval`/scheduler helper) and on-demand admin refresh.
5. Add gateway public/admin proxy routes.
6. Instrument `services/api-gateway/src/routes/export.ts` to write `writer_export_events` for CSV/ZIP success/failure before the snapshot metric is considered unblocked.
7. Add `/trust` public page in writer-web.
8. Add admin dashboard card + `/admin/trust-metrics` detail page.
9. This work UNBLOCKS CHAOS-1810 measurement because CHAOS-1810 can consume stable public trust counters instead of ad hoc SQL.
10. This work UNBLOCKS CHAOS-1813 industry analytics because verified download totals and source stamps create the shared baseline for industry-side funnel analytics.

## Refresh + Caching Policy

- Snapshot refresh interval: every 15 minutes in `metrics-service`.
- On startup: if no snapshot exists, run one refresh before reporting ready; if refresh fails, readiness remains false but liveness stays true.
- Retention: keep daily history indefinitely for now, prune sub-15-minute snapshots older than 90 days in the scheduled job.
- Public HTTP caching: `Cache-Control: public, max-age=300, stale-while-revalidate=900`.
- Admin HTTP caching: `Cache-Control: private, max-age=60, stale-while-revalidate=240`.
- UI revalidation: `/trust` uses Next `revalidate: 300`; admin uses SWR refresh interval 60 seconds.

## Verification

- `pnpm --filter @script-manifest/contracts test` passes after adding schemas.
- `pnpm --filter @script-manifest/metrics-service test` passes aggregation, repository, scheduler, and endpoint tests.
- `pnpm --filter @script-manifest/api-gateway test -- routes/trust-proof-metrics` passes public/admin proxy tests.
- `pnpm --filter @script-manifest/writer-web test -- trust` passes public and admin UI tests.
- Manual SQL check after local seed:

  ```sql
  SELECT *
  FROM trust_proof_metrics_snapshot
  ORDER BY snapshot_at DESC
  LIMIT 1;
  ```

- Manual browser check:
  - Incognito `/trust` renders all public counters and no admin-only source stamps.
  - Admin user `/admin/trust-metrics` renders source stamps and can trigger refresh.
  - Non-admin user cannot access `/admin/trust-metrics` or admin API route.

## Risks

- Counter inflation: repeated export/download events can overstate trust. Mitigation: count raw totals publicly, add admin-only unique counts later, and rate-limit export/download routes.
- Double-counting downloads: `industry_download_audit` is authoritative for verified industry downloads; `script_view_events(event_type='download')` is only a reconciliation signal unless routes are unified.
- GDPR/privacy: public counters must remain aggregate-only; source stamps must not expose industry account, writer, script, or requester identifiers.
- Misleading `writers_exportable_pct`: current export capability is route-based, not per-writer audited. Mitigation: block public “100% exportable” copy until export contract tests and `writer_export_events` instrumentation are landed.
- Scheduler drift/failures: stale snapshots could undermine trust. Mitigation: expose `snapshotAt`, admin warnings, readiness behavior, and alert on refresh failures via service logs/metrics.

## Open Questions

- Should public copy say “Generated exports” only after `writer_export_events` has at least one successful event, or show `0` with a “new metric” explanation?
- Should verified industry downloads count all-time raw downloads or unique `(industry_account_id, script_id)` pairs? MVP uses raw all-time downloads to match success criterion wording.
- Should `/trust` include a short trend history in MVP, or reserve history visualization for CHAOS-1810 measurement?
- Should writer exportable percentage include only users with `role='writer'`, or also co-writers/industry users who have writer profiles? MVP uses `app_users.role='writer'`.

## Linear Sub-Issue Breakdown

1. **[Subtask] CHAOS-1811-A — Add trust proof snapshot + export event schema**
   - Files: `packages/db/migrations/030_trust_proof_metrics.sql`.
   - Acceptance: creates `trust_proof_metrics_snapshot`, `writer_export_events`, indexes, and no overlap with `029`/`031`.
2. **[Subtask] CHAOS-1811-B — Add trust proof metrics contracts**
   - Files: `packages/contracts/src/trust-proof-metrics.ts`, `packages/contracts/src/index.ts`.
   - Acceptance: public/admin response schemas parse fixture payloads and hide admin-only fields from public response.
3. **[Subtask] CHAOS-1811-C — Build metrics-service snapshot refresh**
   - Files: new `services/metrics-service` package with repository, scheduler, endpoints, tests.
   - Acceptance: aggregation fixture test proves every metric query and snapshot source stamp.
4. **[Subtask] CHAOS-1811-D — Instrument export generation events**
   - Files: `services/api-gateway/src/routes/export.ts` and tests.
   - Acceptance: CSV/ZIP success inserts `writer_export_events(status='generated')`; failures insert `status='failed'` when user is known.
5. **[Subtask] CHAOS-1811-E — Expose gateway routes for public/admin trust metrics**
   - Files: `services/api-gateway/src/routes/trust-proof-metrics.ts`, `services/api-gateway/src/index.ts`, route tests.
   - Acceptance: public route works unauthenticated; admin routes require admin role.
6. **[Subtask] CHAOS-1811-F — Ship public `/trust` page**
   - Files: `apps/writer-web/app/trust/page.tsx` and tests.
   - Acceptance: server-rendered accessible counters with SEO metadata and five-minute revalidation.
7. **[Subtask] CHAOS-1811-G — Ship admin trust metrics read-through**
   - Files: `apps/writer-web/app/admin/page.tsx`, `apps/writer-web/app/admin/layout.tsx`, `apps/writer-web/app/admin/trust-metrics/page.tsx`, admin API proxy route/tests.
   - Acceptance: admin sees source stamps, refresh status, warnings, and can trigger refresh; non-admin remains blocked.
