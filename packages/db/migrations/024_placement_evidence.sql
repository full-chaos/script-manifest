-- Migration 024: evidence-backed historical placements

ALTER TABLE placements
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_note VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS recorded_by_user_id TEXT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes VARCHAR(2000);

CREATE TABLE IF NOT EXISTS placement_evidence (
  id TEXT PRIMARY KEY,
  placement_id TEXT NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  script_id TEXT REFERENCES scripts(id),
  evidence_url VARCHAR(2048),
  kind TEXT NOT NULL CHECK (kind IN ('screenshot', 'pdf', 'document', 'url', 'other')),
  caption VARCHAR(500),
  uploaded_by_user_id TEXT NOT NULL REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (script_id IS NOT NULL OR evidence_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS placement_evidence_placement_idx ON placement_evidence(placement_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scripts_visibility_check'
      AND conrelid = 'scripts'::regclass
  ) THEN
    ALTER TABLE scripts
      ADD CONSTRAINT scripts_visibility_check
      CHECK (visibility IN ('private', 'approved_only', 'public', 'evidence'));
  END IF;
END $$;
