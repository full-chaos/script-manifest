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

CREATE INDEX IF NOT EXISTS writer_export_events_writer_idx
  ON writer_export_events(writer_id, generated_at DESC);
