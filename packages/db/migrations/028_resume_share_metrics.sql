CREATE TABLE IF NOT EXISTS resume_page_views (
  id TEXT PRIMARY KEY,
  writer_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewer_user_id TEXT REFERENCES app_users(id),
  referrer VARCHAR(2048),
  user_agent_hash TEXT,
  ip_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_rpv_writer_time ON resume_page_views(writer_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpv_dedupe ON resume_page_views(writer_id, ip_hash, user_agent_hash, viewed_at DESC);

CREATE TABLE IF NOT EXISTS script_view_events (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES app_users(id),
  viewer_user_id TEXT REFERENCES app_users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'download')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sve_owner_time ON script_view_events(owner_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sve_script_time ON script_view_events(script_id, occurred_at DESC);

ALTER TABLE writer_profiles
  ADD COLUMN IF NOT EXISTS resume_public BOOLEAN NOT NULL DEFAULT TRUE;
