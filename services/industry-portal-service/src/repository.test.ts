import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

const { toFtsPrefixQuery } = await import("@script-manifest/db");

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    ensureCoreTables: async () => undefined,
    ensureIndustryPortalTables: async () => undefined,
    toFtsPrefixQuery
  }
});

const { PgIndustryPortalRepository } = await import("./repository.js");

test("PgIndustryPortalRepository userExists checks rowCount", async () => {
  queryImpl = async () => ({ rows: [{ one: 1 }], rowCount: 1 });

  const repo = new PgIndustryPortalRepository();
  const exists = await repo.userExists("user_1");

  assert.equal(exists, true);
});

test("PgIndustryPortalRepository getAccountById maps account timestamps", async () => {
  const verifiedAt = new Date("2026-02-03T12:00:00.000Z");
  const createdAt = new Date("2026-02-01T12:00:00.000Z");
  const updatedAt = new Date("2026-02-04T12:00:00.000Z");

  queryImpl = async () => ({
    rowCount: 1,
    rows: [
      {
        id: "industry_account_1",
        user_id: "user_1",
        company_name: "Studio Co",
        role_title: "Executive",
        professional_email: "exec@example.com",
        website_url: "https://studio.example.com",
        linkedin_url: "https://linkedin.com/in/executive",
        imdb_url: "https://imdb.com/name/nm0000001",
        verification_status: "verified",
        verification_notes: "approved",
        verified_by_user_id: "reviewer_1",
        verified_at: verifiedAt,
        created_at: createdAt,
        updated_at: updatedAt
      }
    ]
  });

  const repo = new PgIndustryPortalRepository();
  const account = await repo.getAccountById("industry_account_1");

  assert.ok(account);
  assert.equal(account.id, "industry_account_1");
  assert.equal(account.verifiedAt, verifiedAt.toISOString());
  assert.equal(account.createdAt, createdAt.toISOString());
  assert.equal(account.updatedAt, updatedAt.toISOString());
});
