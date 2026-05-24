-- Migration 029: provider verification badges and SLA policy support

ALTER TABLE coverage_providers
  ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified', 'verified', 'rejected', 'suspended')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by_user_id TEXT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS verification_notes VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS verification_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE coverage_providers
SET verification_state = 'unverified'
WHERE verification_state IS NULL;

CREATE TABLE IF NOT EXISTS provider_verification_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES coverage_providers(id) ON DELETE CASCADE,
  admin_user_id TEXT NOT NULL REFERENCES app_users(id),
  from_state TEXT CHECK (from_state IS NULL OR from_state IN ('unverified', 'verified', 'rejected', 'suspended')),
  to_state TEXT NOT NULL CHECK (to_state IN ('unverified', 'verified', 'rejected', 'suspended')),
  reason VARCHAR(2000),
  checklist TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coverage_providers_verification_state
  ON coverage_providers(verification_state);

CREATE INDEX IF NOT EXISTS idx_coverage_providers_verified
  ON coverage_providers(verified_at DESC)
  WHERE verification_state = 'verified';

CREATE INDEX IF NOT EXISTS idx_provider_verification_events_provider_created
  ON provider_verification_events(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_verification_events_admin_created
  ON provider_verification_events(admin_user_id, created_at DESC);
