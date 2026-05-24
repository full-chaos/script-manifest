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
    runMigrations: async () => undefined,
    toFtsPrefixQuery
  }
});

const { PgCompetitionDirectoryRepository } = await import("./pgRepository.js");

test("saveCompetition creates one undispatched reminder row per future reminder day", async () => {
  const statements: string[] = [];
  const valuesSeen: unknown[][] = [];

  queryImpl = async (sql, values = []) => {
    statements.push(sql);
    valuesSeen.push(values);
    if (sql.includes("SELECT * FROM competitions WHERE id = $1")) {
      return {
        rows: [{
          id: "comp_save_1",
          title: "Future Lab",
          description: "Feature lab",
          format: "feature",
          genre: "drama",
          fee_usd: 0,
          deadline: new Date("2030-06-15T00:00:00.000Z"),
          status: "active",
          visibility: "listed",
          access_type: "open",
          location: "Worldwide",
          language: "en",
          fee_tier: "free",
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z")
        }]
      };
    }
    return { rows: [] };
  };

  const repo = new PgCompetitionDirectoryRepository();
  const saved = await repo.saveCompetition({
    writerId: "writer_1",
    competitionId: "comp_save_1",
    remindDaysBefore: [14, 7, 1]
  });

  assert.equal(saved.writerId, "writer_1");
  assert.equal(saved.competitionId, "comp_save_1");
  const scheduleIndex = statements.findIndex((sql) => sql.includes("INSERT INTO competition_reminder_dispatch"));
  assert.notEqual(scheduleIndex, -1);
  assert.deepEqual(valuesSeen[scheduleIndex]?.slice(0, 3), ["writer_1", "comp_save_1", [14, 7, 1]]);
});

test("unsaveCompetition removes only undispatched reminder rows for the saved pair", async () => {
  let deleteSql = "";
  let deleteValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    if (sql.includes("DELETE FROM competition_reminder_dispatch")) {
      deleteSql = sql;
      deleteValues = values;
    }
    return { rows: [], rowCount: 1 };
  };

  const repo = new PgCompetitionDirectoryRepository();
  const removed = await repo.unsaveCompetition("writer_1", "comp_save_1");

  assert.equal(removed, true);
  assert.match(deleteSql, /dispatched_at IS NULL/);
  assert.deepEqual(deleteValues, ["writer_1", "comp_save_1"]);
});
