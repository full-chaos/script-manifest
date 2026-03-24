-- Migration 021: Add admin control fields to competitions (cancel, visibility, invite-only)

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'listed',
  ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'open';

ALTER TABLE competitions
  ADD CONSTRAINT chk_competitions_status CHECK (status IN ('active', 'cancelled'));

ALTER TABLE competitions
  ADD CONSTRAINT chk_competitions_visibility CHECK (visibility IN ('listed', 'unlisted'));

ALTER TABLE competitions
  ADD CONSTRAINT chk_competitions_access_type CHECK (access_type IN ('open', 'invite_only'));

CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_visibility ON competitions(visibility);
