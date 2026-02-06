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
      bio TEXT NOT NULL DEFAULT '',
      genres TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      representation_status TEXT NOT NULL DEFAULT 'unrepresented',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      logline TEXT NOT NULL DEFAULT '',
      synopsis TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      genre TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      is_discoverable BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
