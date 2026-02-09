import { Pool } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://manifest:manifest@localhost:5432/manifest";

const pools = new Map<string, Pool>();

export function getPool(databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): Pool {
  if (!pools.has(databaseUrl)) {
    pools.set(databaseUrl, new Pool({ connectionString: databaseUrl }));
  }

  return pools.get(databaseUrl)!;
}

export async function closePool(databaseUrl?: string): Promise<void> {
  if (databaseUrl) {
    const pool = pools.get(databaseUrl);
    if (pool) {
      await pool.end();
      pools.delete(databaseUrl);
    }
  } else {
    // Close all pools if no specific URL provided
    await Promise.all(
      Array.from(pools.values()).map((pool) => pool.end())
    );
    pools.clear();
  }
}

export async function ensureCoreTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS writer_profiles (
      writer_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      bio VARCHAR(5000) NOT NULL DEFAULT '',
      genres TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      demographics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      representation_status TEXT NOT NULL DEFAULT 'unrepresented',
      headshot_url VARCHAR(2048) NOT NULL DEFAULT '',
      custom_profile_url VARCHAR(2048) NOT NULL DEFAULT '',
      is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backfill profile table columns for databases created before rich profile fields existed.
  await db.query(`
    ALTER TABLE writer_profiles
    ADD COLUMN IF NOT EXISTS demographics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS headshot_url VARCHAR(2048) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS custom_profile_url VARCHAR(2048) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      logline VARCHAR(500) NOT NULL DEFAULT '',
      synopsis VARCHAR(5000) NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      genre TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_co_writers (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      co_writer_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      credit_order INTEGER NOT NULL DEFAULT 1 CHECK (credit_order > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, co_writer_user_id),
      CHECK (owner_user_id <> co_writer_user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS project_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      script_id TEXT NOT NULL,
      version_label TEXT NOT NULL,
      change_summary VARCHAR(4000) NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
      lifecycle_state TEXT NOT NULL DEFAULT 'active'
        CHECK (lifecycle_state IN ('active', 'archived')),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS script_access_requests (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      requester_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      reason VARCHAR(500) NOT NULL DEFAULT '',
      decision_reason VARCHAR(500) NULL,
      decided_by_user_id TEXT NULL REFERENCES app_users(id) ON DELETE SET NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_drafts_primary
      ON project_drafts(project_id)
      WHERE is_primary = TRUE;
  `);

  // Add indexes for foreign keys and common queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_projects_owner_user_id
      ON projects(owner_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_project_drafts_project_id
      ON project_drafts(project_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_project_co_writers_co_writer_user_id
      ON project_co_writers(co_writer_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_script_id
      ON script_access_requests(script_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_owner_user_id
      ON script_access_requests(owner_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_script_access_requests_requester_user_id
      ON script_access_requests(requester_user_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id
      ON app_sessions(user_id);
  `);
}
