-- Migration 009: competition-directory tables

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL,
  genre TEXT NOT NULL,
  fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitions_format ON competitions(format);
CREATE INDEX IF NOT EXISTS idx_competitions_genre ON competitions(genre);
CREATE INDEX IF NOT EXISTS idx_competitions_deadline ON competitions(deadline);

-- Seed data: hardcoded comp_001 record
INSERT INTO competitions (id, title, description, format, genre, fee_usd, deadline)
VALUES ('comp_001', 'Screenplay Sprint', 'Seed competition record for local development', 'feature', 'drama', 25, '2026-05-01T23:59:59Z')
ON CONFLICT (id) DO NOTHING;
