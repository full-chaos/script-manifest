import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, ensurePartnerTables, ensureProgramsTables, getPool } from "../src/index.js";

const source = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");

test("ensureProgramsTables includes phase 6 hardening tables and indexes", () => {
  const requiredSnippets = [
    "CREATE TABLE IF NOT EXISTS program_outcomes",
    "CREATE INDEX IF NOT EXISTS idx_program_outcomes_program_created",
    "CREATE TABLE IF NOT EXISTS program_crm_sync_jobs",
    "CREATE INDEX IF NOT EXISTS idx_program_crm_sync_jobs_status_next_attempt",
    "CREATE TABLE IF NOT EXISTS program_notification_log",
    "CREATE TABLE IF NOT EXISTS program_kpi_snapshots"
  ];

  for (const snippet of requiredSnippets) {
    assert.match(source, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("ensureProgramsTables executes phase 6 migration DDL", async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/manifest_phase6_smoke";
  process.env.DATABASE_URL = databaseUrl;

  const pool = getPool(databaseUrl) as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  const originalQuery = pool.query.bind(pool);
  const observedSql: string[] = [];
  pool.query = async (sql: string) => {
    observedSql.push(sql);
    return { rows: [], rowCount: 0 };
  };

  t.after(async () => {
    pool.query = originalQuery;
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    await closePool(databaseUrl);
  });

  await ensureProgramsTables();

  const ddl = observedSql.join("\n");
  const requiredStatements = [
    "CREATE TABLE IF NOT EXISTS program_outcomes",
    "CREATE INDEX IF NOT EXISTS idx_program_outcomes_program_created",
    "CREATE TABLE IF NOT EXISTS program_crm_sync_jobs",
    "CREATE INDEX IF NOT EXISTS idx_program_crm_sync_jobs_status_next_attempt",
    "CREATE TABLE IF NOT EXISTS program_notification_log",
    "CREATE INDEX IF NOT EXISTS idx_program_notification_log_program_type",
    "CREATE TABLE IF NOT EXISTS program_kpi_snapshots"
  ];

  for (const statement of requiredStatements) {
    assert.match(ddl, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("ensurePartnerTables includes phase 7 hardening tables and columns", () => {
  const requiredSnippets = [
    "CREATE TABLE IF NOT EXISTS organizer_memberships",
    "ALTER TABLE partner_submissions",
    "ADD COLUMN IF NOT EXISTS form_responses JSONB",
    "CREATE TABLE IF NOT EXISTS partner_sync_jobs",
    "status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))",
    "CREATE TABLE IF NOT EXISTS partner_competition_intake_configs",
    "updated_by_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE",
    "CREATE TABLE IF NOT EXISTS partner_entrant_messages",
    "message_kind TEXT NOT NULL CHECK (message_kind IN ('direct', 'broadcast', 'reminder'))",
    "metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_partner_entrant_messages_competition_created"
  ];

  for (const snippet of requiredSnippets) {
    assert.match(source, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("ensurePartnerTables executes phase 7 migration DDL", async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/manifest_phase7_smoke";
  process.env.DATABASE_URL = databaseUrl;

  const pool = getPool(databaseUrl) as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  const originalQuery = pool.query.bind(pool);
  const observedSql: string[] = [];
  pool.query = async (sql: string) => {
    observedSql.push(sql);
    return { rows: [], rowCount: 0 };
  };

  t.after(async () => {
    pool.query = originalQuery;
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    await closePool(databaseUrl);
  });

  await ensurePartnerTables();

  const ddl = observedSql.join("\n");
  const requiredStatements = [
    "CREATE TABLE IF NOT EXISTS organizer_memberships",
    "CREATE TABLE IF NOT EXISTS partner_submissions",
    "ALTER TABLE partner_submissions",
    "ADD COLUMN IF NOT EXISTS form_responses JSONB",
    "CREATE TABLE IF NOT EXISTS partner_sync_jobs",
    "CREATE TABLE IF NOT EXISTS partner_competition_intake_configs",
    "CREATE TABLE IF NOT EXISTS partner_entrant_messages",
    "CREATE INDEX IF NOT EXISTS idx_partner_entrant_messages_competition_created"
  ];

  for (const statement of requiredStatements) {
    assert.match(ddl, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
