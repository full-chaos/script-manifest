import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

const MIGRATION_LOCK_ID = 71234568;
const BASELINE_MIGRATIONS = [
  "001_core_tables.sql",
  "002_feedback_exchange.sql",
  "003_industry_portal.sql",
  "004_programs.sql",
  "005_partners.sql",
  "006_ranking.sql",
  "007_coverage_marketplace.sql",
];

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function runMigrations(pool: Pool): Promise<void> {
  const lockClient = await pool.connect();

  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    const { rows: preMigrationRows } = await lockClient.query<{
      has_schema_migrations: boolean;
      has_app_users: boolean;
    }>(`
      SELECT
        to_regclass('public.schema_migrations') IS NOT NULL AS has_schema_migrations,
        to_regclass('public.app_users') IS NOT NULL AS has_app_users
    `);

    const preMigrationState = preMigrationRows[0] ?? {
      has_schema_migrations: false,
      has_app_users: false,
    };

    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (!preMigrationState.has_schema_migrations && preMigrationState.has_app_users) {
      for (const version of BASELINE_MIGRATIONS) {
        await lockClient.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
          [version],
        );
      }
    }

    const migrationFiles = (await readdir(migrationsDir))
      .filter((entry) => entry.endsWith(".sql"))
      .sort();

    const { rows: appliedRows } = await lockClient.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const appliedVersions = new Set(appliedRows.map((row) => row.version));

    for (const migrationFile of migrationFiles) {
      if (appliedVersions.has(migrationFile)) {
        continue;
      }

      const migrationSql = await readFile(join(migrationsDir, migrationFile), "utf8");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(migrationSql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migrationFile]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    lockClient.release();
  }
}
