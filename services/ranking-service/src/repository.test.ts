import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
let clientQueryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
let clientReleased = false;
let ensureRankingTablesCalls = 0;

const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);
const client = {
  query: async (sql: string, values: unknown[] = []) => clientQueryImpl(sql, values),
  release: () => {
    clientReleased = true;
  }
};

mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({
      query,
      connect: async () => client
    }),
    ensureRankingTables: async () => {
      ensureRankingTablesCalls += 1;
    }
  }
});

const { PgRankingRepository } = await import("./repository.js");

test("PgRankingRepository init skips schema creation when disabled", async () => {
  const original = process.env.SKIP_SCHEMA_INIT;
  process.env.SKIP_SCHEMA_INIT = "1";
  ensureRankingTablesCalls = 0;

  try {
    const repo = new PgRankingRepository();
    await repo.init();

    assert.equal(ensureRankingTablesCalls, 0);
  } finally {
    if (original === undefined) {
      delete process.env.SKIP_SCHEMA_INIT;
    } else {
      process.env.SKIP_SCHEMA_INIT = original;
    }
  }
});

test("PgRankingRepository healthCheck returns database availability", async () => {
  queryImpl = async () => ({ rows: [] });

  const repo = new PgRankingRepository();
  await assert.doesNotReject(repo.healthCheck());
  assert.deepEqual(await repo.healthCheck(), { database: true });

  queryImpl = async () => {
    throw new Error("db down");
  };

  assert.deepEqual(await repo.healthCheck(), { database: false });
});

test("PgRankingRepository getPrestige and listLeaderboard map rows and build filters", async () => {
  let countSql = "";
  let countValues: unknown[] = [];
  let listSql = "";
  let listValues: unknown[] = [];
  let badgeSql = "";
  let badgeValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    if (sql.includes("FROM competition_prestige")) {
      return {
        rows: [
          {
            competition_id: "comp_1",
            tier: "elite",
            multiplier: 2.5,
            updated_at: new Date("2026-02-01T00:00:00.000Z")
          }
        ]
      };
    }

    if (sql.includes("COUNT(*)::int as total FROM writer_scores")) {
      countSql = sql;
      countValues = values;
      return { rows: [{ total: 1 }] };
    }

    if (sql.includes("SELECT * FROM writer_scores")) {
      listSql = sql;
      listValues = values;
      return {
        rows: [
          {
            writer_id: "writer_1",
            total_score: 42,
            submission_count: 7,
            placement_count: 3,
            rank: 2,
            tier: "top_10",
            score_change_30d: 5.5,
            last_updated_at: new Date("2026-03-01T00:00:00.000Z")
          }
        ]
      };
    }

    if (sql.includes("FROM writer_badges")) {
      badgeSql = sql;
      badgeValues = values;
      return {
        rows: [
          {
            id: "badge_1",
            writer_id: "writer_1",
            label: "Top 10",
            placement_id: "placement_1",
            competition_id: "comp_1",
            awarded_at: new Date("2026-03-02T00:00:00.000Z")
          }
        ]
      };
    }

    return { rows: [] };
  };

  const repo = new PgRankingRepository();
  const prestige = await repo.getPrestige("comp_1");
  assert.deepEqual(prestige, {
    competitionId: "comp_1",
    tier: "elite",
    multiplier: 2.5,
    updatedAt: "2026-02-01T00:00:00.000Z"
  });

  const result = await repo.listLeaderboard(
    { tier: "top_10", trending: true, limit: 10, offset: 5 },
    new Set(["writer_1"])
  );

  assert.equal(result.total, 1);
  assert.deepEqual(result.entries, [
    {
      writerId: "writer_1",
      rank: 2,
      totalScore: 42,
      submissionCount: 7,
      placementCount: 3,
      tier: "top_10",
      badges: ["Top 10"],
      scoreChange30d: 5.5,
      lastUpdatedAt: "2026-03-01T00:00:00.000Z"
    }
  ]);
  assert.match(countSql, /tier = \$1/);
  assert.match(countSql, /writer_id = ANY\(\$2\)/);
  assert.match(listSql, /ORDER BY score_change_30d DESC, total_score DESC/);
  assert.match(listSql, /LIMIT \$3 OFFSET \$4/);
  assert.match(badgeSql, /WHERE writer_id = ANY\(\$1\)/);
  assert.deepEqual(countValues, ["top_10", ["writer_1"]]);
  assert.deepEqual(listValues, ["top_10", ["writer_1"], 10, 5]);
  assert.deepEqual(badgeValues, [["writer_1"]]);
});

test("PgRankingRepository upsertWriterScore and bulkUpsertWriterScores build insert batches", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  queryImpl = async (sql, values = []) => {
    calls.push({ sql, values });
    return { rows: [] };
  };

  const repo = new PgRankingRepository();

  await repo.upsertWriterScore({
    writerId: "writer_1",
    totalScore: 10,
    submissionCount: 2,
    placementCount: 1,
    rank: 4,
    tier: "top_25",
    scoreChange30d: 1.5,
    lastUpdatedAt: "2026-03-01T00:00:00.000Z"
  });

  await repo.bulkUpsertWriterScores([
    {
      writerId: "writer_2",
      totalScore: 20,
      submissionCount: 4,
      placementCount: 2,
      rank: 3,
      tier: "top_10",
      scoreChange30d: 2.5,
      lastUpdatedAt: "2026-03-02T00:00:00.000Z"
    },
    {
      writerId: "writer_3",
      totalScore: 30,
      submissionCount: 6,
      placementCount: 3,
      rank: null,
      tier: null,
      scoreChange30d: 3.5,
      lastUpdatedAt: "2026-03-03T00:00:00.000Z"
    }
  ]);

  assert.equal(calls.length, 2);
  assert.match(calls[0]!.sql, /ON CONFLICT \(writer_id\) DO UPDATE SET/);
  assert.deepEqual(calls[0]!.values, ["writer_1", 10, 2, 1, 4, "top_25", 1.5, "2026-03-01T00:00:00.000Z"]);
  assert.match(calls[1]!.sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\), \(\$9, \$10, \$11, \$12, \$13, \$14, \$15, \$16\)/);
  assert.deepEqual(calls[1]!.values, [
    "writer_2",
    20,
    4,
    2,
    3,
    "top_10",
    2.5,
    "2026-03-02T00:00:00.000Z",
    "writer_3",
    30,
    6,
    3,
    null,
    null,
    3.5,
    "2026-03-03T00:00:00.000Z"
  ]);
});

test("PgRankingRepository replaceAllPlacementScores wraps delete and insert in a transaction", async () => {
  clientReleased = false;
  const clientCalls: Array<{ sql: string; values: unknown[] }> = [];
  clientQueryImpl = async (sql, values = []) => {
    clientCalls.push({ sql, values });
    return { rows: [] };
  };

  const repo = new PgRankingRepository();
  await repo.replaceAllPlacementScores([
    {
      placementId: "pl_1",
      writerId: "writer_1",
      competitionId: "comp_1",
      projectId: "proj_1",
      statusWeight: 10,
      prestigeMultiplier: 2,
      verificationMultiplier: 1,
      timeDecayFactor: 0.9,
      confidenceFactor: 0.8,
      rawScore: 14.4,
      placementDate: "2026-03-01T00:00:00.000Z"
    }
  ]);

  assert.equal(clientReleased, true);
  assert.equal(clientCalls.length, 4);
  assert.equal(clientCalls[0]!.sql, "BEGIN");
  assert.equal(clientCalls[1]!.sql, "DELETE FROM placement_scores");
  assert.equal(clientCalls[3]!.sql, "COMMIT");
  assert.match(clientCalls[2]!.sql, /INSERT INTO placement_scores/);
  assert.match(clientCalls[2]!.sql, /ON CONFLICT \(placement_id\) DO UPDATE SET/);
  assert.deepEqual(clientCalls[2]!.values, [
    "pl_1",
    "writer_1",
    "comp_1",
    "proj_1",
    10,
    2,
    1,
    0.9,
    0.8,
    14.4,
    "2026-03-01T00:00:00.000Z"
  ]);
});
