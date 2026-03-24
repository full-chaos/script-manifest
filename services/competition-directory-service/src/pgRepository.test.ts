import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    runMigrations: async () => undefined
  }
});

const { PgCompetitionDirectoryRepository } = await import("./pgRepository.js");

test("PgCompetitionDirectoryRepository upsertCompetition returns existed when xmax is non-zero", async () => {
  queryImpl = async () => ({
    rows: [
      {
        id: "comp_1",
        title: "Competition",
        description: "Desc",
        format: "feature",
        genre: "drama",
        fee_usd: "25",
        deadline: new Date("2026-06-01T00:00:00.000Z"),
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-02T00:00:00.000Z"),
        xmax: "5"
      }
    ]
  });

  const repo = new PgCompetitionDirectoryRepository();
  const result = await repo.upsertCompetition({
    id: "comp_1",
    title: "Competition",
    description: "Desc",
    format: "feature",
    genre: "drama",
    feeUsd: 25,
    deadline: "2026-06-01T00:00:00.000Z",
    status: "active",
    visibility: "listed",
    accessType: "open"
  });

  assert.deepEqual(result, { existed: true });
});

test("PgCompetitionDirectoryRepository listCompetitions applies all filters", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return { rows: [] };
  };

  const repo = new PgCompetitionDirectoryRepository();
  const competitions = await repo.listCompetitions({
    query: "drama",
    format: "feature",
    genre: "drama",
    maxFeeUsd: 30,
    deadlineBefore: new Date("2026-08-01T00:00:00.000Z")
  });

  assert.deepEqual(competitions, []);
  assert.match(capturedSql, /status = 'active'/);
  assert.match(capturedSql, /visibility = 'listed'/);
  assert.match(capturedSql, /title ILIKE \$1/);
  assert.match(capturedSql, /LOWER\(format\) = LOWER\(\$2\)/);
  assert.match(capturedSql, /LOWER\(genre\) = LOWER\(\$3\)/);
  assert.match(capturedSql, /fee_usd <= \$4/);
  assert.match(capturedSql, /deadline < \$5/);
  assert.deepEqual(capturedValues, ["%drama%", "feature", "drama", 30, "2026-08-01T00:00:00.000Z"]);
});
