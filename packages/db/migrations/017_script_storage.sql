CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER,
  visibility TEXT NOT NULL DEFAULT 'private',
  approved_viewers TEXT[] NOT NULL DEFAULT '{}',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scripts_owner ON scripts(owner_user_id);
