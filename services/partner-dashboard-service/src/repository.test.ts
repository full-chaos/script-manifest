import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    ensureCoreTables: async () => undefined,
    ensurePartnerTables: async () => undefined
  }
});

const { PgPartnerDashboardRepository } = await import("./repository.js");

test("PgPartnerDashboardRepository healthCheck returns true when query succeeds", async () => {
  queryImpl = async () => ({ rows: [] });
  const repo = new PgPartnerDashboardRepository();

  const health = await repo.healthCheck();

  assert.deepEqual(health, { database: true });
});

test("PgPartnerDashboardRepository getCompetitionRole returns membership role", async () => {
  let capturedValues: unknown[] = [];

  queryImpl = async (_sql, values = []) => {
    capturedValues = values;
    return {
      rowCount: 1,
      rows: [{ role: "admin" }]
    };
  };

  const repo = new PgPartnerDashboardRepository();
  const role = await repo.getCompetitionRole("comp_1", "user_1");

  assert.equal(role, "admin");
  assert.deepEqual(capturedValues, ["comp_1", "user_1"]);
});
