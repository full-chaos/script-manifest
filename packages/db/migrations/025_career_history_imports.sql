-- Migration 025: CSV imports for recovered career history

CREATE TABLE IF NOT EXISTS career_history_imports (
  id TEXT PRIMARY KEY,
  writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  filename VARCHAR(255),
  row_count INT NOT NULL DEFAULT 0,
  succeeded INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','validated','committed','failed')),
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_career_history_imports_writer_created
  ON career_history_imports(writer_id, created_at DESC);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS import_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (import_source IN ('manual','csv_import','historical_form','recovered_csv')),
  ADD COLUMN IF NOT EXISTS import_batch_id TEXT REFERENCES career_history_imports(id);

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS import_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (import_source IN ('manual','csv_import','historical_form','recovered_csv')),
  ADD COLUMN IF NOT EXISTS import_batch_id TEXT REFERENCES career_history_imports(id);

CREATE INDEX IF NOT EXISTS idx_submissions_import_batch ON submissions(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_placements_import_batch ON placements(import_batch_id);
