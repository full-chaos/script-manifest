-- Migration 026: saved competitions, reminder dispatch, and eligibility filters

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'Worldwide',
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE competitions
  ADD COLUMN IF NOT EXISTS fee_tier TEXT GENERATED ALWAYS AS (
    CASE
      WHEN fee_usd = 0 THEN 'free'
      WHEN fee_usd < 30 THEN 'low'
      WHEN fee_usd < 70 THEN 'mid'
      ELSE 'high'
    END
  ) STORED;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE TABLE IF NOT EXISTS saved_competitions (
  writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remind_days_before INT[] NOT NULL DEFAULT ARRAY[14,7,1],
  PRIMARY KEY (writer_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_competitions_writer ON saved_competitions(writer_id);

CREATE TABLE IF NOT EXISTS competition_reminder_dispatch (
  id TEXT PRIMARY KEY,
  writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  fire_at TIMESTAMPTZ NOT NULL,
  dispatched_at TIMESTAMPTZ,
  notification_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (writer_id, competition_id, fire_at)
);

CREATE INDEX IF NOT EXISTS competition_reminder_dispatch_fire_at_idx
  ON competition_reminder_dispatch(fire_at)
  WHERE dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_competitions_location ON competitions(location);
CREATE INDEX IF NOT EXISTS idx_competitions_language ON competitions(language);
CREATE INDEX IF NOT EXISTS idx_competitions_fee_tier ON competitions(fee_tier);
