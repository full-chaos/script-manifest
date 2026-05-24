import { randomUUID } from "node:crypto";
import { getPool, healthCheck, type PoolConfig } from "@script-manifest/db";
import type { TrustProofMetrics } from "@script-manifest/contracts";
import type { Pool } from "pg";

type SnapshotRow = {
  snapshot_at: Date | string;
  scripts_hosted_total: number;
  placements_recorded_total: number;
  placements_verified_total: number;
  competitions_tracked_total: number;
  exports_generated_total: number;
  verified_industry_downloads_total: number;
  writers_exportable_pct: number | string;
  source_scripts_max_updated_at: Date | string | null;
  source_placements_max_updated_at: Date | string | null;
  source_competitions_max_saved_at: Date | string | null;
  source_exports_max_generated_at: Date | string | null;
  source_downloads_max_downloaded_at: Date | string | null;
  source_writers_max_updated_at: Date | string | null;
};

export type TrustProofMetricsRepository = {
  getLatestSnapshot(): Promise<TrustProofMetrics | null>;
  refreshSnapshot(): Promise<TrustProofMetrics>;
  pruneSnapshots(): Promise<void>;
};

export const REFRESH_TRUST_PROOF_METRICS_SQL = `
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
    $1,
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
  FROM script_metric, placement_metric, competition_metric, export_metric, download_metric, exportable_metric
  RETURNING *;
`;

const LATEST_SNAPSHOT_SQL = `
  SELECT *
  FROM trust_proof_metrics_snapshot
  ORDER BY snapshot_at DESC
  LIMIT 1;
`;

const PRUNE_SNAPSHOTS_SQL = `
  DELETE FROM trust_proof_metrics_snapshot old_snapshot
  WHERE old_snapshot.snapshot_at < NOW() - INTERVAL '90 days'
    AND EXISTS (
      SELECT 1
      FROM trust_proof_metrics_snapshot newer_snapshot
      WHERE newer_snapshot.snapshot_at::date = old_snapshot.snapshot_at::date
        AND newer_snapshot.snapshot_at > old_snapshot.snapshot_at
    );
`;

export class PostgresTrustProofMetricsRepository implements TrustProofMetricsRepository {
  private readonly pool: Pool;

  constructor(databaseUrl?: string, poolConfig?: PoolConfig) {
    this.pool = getPool(databaseUrl, poolConfig);
  }

  async healthCheck(databaseUrl?: string): Promise<{ database: boolean }> {
    return healthCheck(databaseUrl);
  }

  async getLatestSnapshot(): Promise<TrustProofMetrics | null> {
    const result = await this.pool.query<SnapshotRow>(LATEST_SNAPSHOT_SQL);
    const row = result.rows[0];
    return row ? mapSnapshot(row) : null;
  }

  async refreshSnapshot(): Promise<TrustProofMetrics> {
    const id = `tpm_${randomUUID().replaceAll("-", "")}`;
    const result = await this.pool.query<SnapshotRow>(REFRESH_TRUST_PROOF_METRICS_SQL, [id]);
    const row = result.rows[0];
    if (!row) {
      throw new Error("trust proof metrics refresh did not return a snapshot");
    }
    return mapSnapshot(row);
  }

  async pruneSnapshots(): Promise<void> {
    await this.pool.query(PRUNE_SNAPSHOTS_SQL);
  }
}

function mapSnapshot(row: SnapshotRow): TrustProofMetrics {
  return {
    snapshotAt: toIso(row.snapshot_at),
    scriptsHostedTotal: row.scripts_hosted_total,
    placementsRecordedTotal: row.placements_recorded_total,
    placementsVerifiedTotal: row.placements_verified_total,
    competitionsTrackedTotal: row.competitions_tracked_total,
    exportsGeneratedTotal: row.exports_generated_total,
    verifiedIndustryDownloadsTotal: row.verified_industry_downloads_total,
    writersExportablePct: Number(row.writers_exportable_pct),
    sourceDataStamps: {
      scriptsMaxUpdatedAt: nullableIso(row.source_scripts_max_updated_at),
      placementsMaxUpdatedAt: nullableIso(row.source_placements_max_updated_at),
      competitionsMaxSavedAt: nullableIso(row.source_competitions_max_saved_at),
      exportsMaxGeneratedAt: nullableIso(row.source_exports_max_generated_at),
      downloadsMaxDownloadedAt: nullableIso(row.source_downloads_max_downloaded_at),
      writersMaxUpdatedAt: nullableIso(row.source_writers_max_updated_at)
    }
  };
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
