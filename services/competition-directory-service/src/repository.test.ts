import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

const publishCalls: unknown[] = [];
let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

const { toFtsPrefixQuery } = await import("@script-manifest/db");

mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    runMigrations: async () => undefined,
    toFtsPrefixQuery
  }
});

mock.module("@script-manifest/service-utils", {
  namedExports: {
    publishSearchSyncEvent: async (event: unknown) => {
      publishCalls.push(event);
    }
  }
});

const { PgCompetitionDirectoryRepository } = await import("./pgRepository.js");

beforeEach(() => {
  publishCalls.length = 0;
  queryImpl = async () => ({ rows: [], rowCount: 0 });
});

function competitionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "comp_1",
    title: "Screenplay Sprint",
    description: "Seed competition record",
    format: "feature",
    genre: "drama",
    fee_usd: "25",
    deadline: new Date("2026-05-01T23:59:59.000Z"),
    status: "active",
    visibility: "listed",
    access_type: "open",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides
  };
}

test("PgCompetitionDirectoryRepository retrieves and lists mapped competitions", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];

  queryImpl = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes("WHERE id = $1")) {
      return { rows: [competitionRow()] };
    }
    if (sql.includes("ORDER BY created_at")) {
      return { rows: [competitionRow(), competitionRow({ id: "comp_2", title: "TV Pilot Challenge", fee_usd: 50 })] };
    }
    return { rows: [] };
  };

  const repo = new PgCompetitionDirectoryRepository();
  const competition = await repo.getCompetition("comp_1");
  const allCompetitions = await repo.getAllCompetitions();

  assert.deepEqual(competition, {
    id: "comp_1",
    title: "Screenplay Sprint",
    description: "Seed competition record",
    format: "feature",
    genre: "drama",
    feeUsd: 25,
    deadline: "2026-05-01T23:59:59.000Z",
    status: "active",
    visibility: "listed",
    accessType: "open"
  });
  assert.deepEqual(allCompetitions.map((item) => item.id), ["comp_1", "comp_2"]);
  assert.equal(calls[0]?.sql.trim(), "SELECT * FROM competitions WHERE id = $1");
  assert.deepEqual(calls[0]?.values, ["comp_1"]);
  assert.equal(calls[1]?.sql, "SELECT * FROM competitions ORDER BY created_at");
});

test("PgCompetitionDirectoryRepository updates status, visibility, and access type with sync events", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];

  queryImpl = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes("SET status = 'cancelled'")) {
      return { rows: [competitionRow({ status: "cancelled" })], rowCount: 1 };
    }
    if (sql.includes("SET visibility = $2")) {
      return { rows: [competitionRow({ visibility: "unlisted" })], rowCount: 1 };
    }
    if (sql.includes("SET access_type = $2")) {
      return { rows: [competitionRow({ access_type: "invite_only" })], rowCount: 1 };
    }
    return { rows: [] };
  };

  const repo = new PgCompetitionDirectoryRepository();
  const cancelled = await repo.cancelCompetition("comp_1");
  const hidden = await repo.updateVisibility("comp_1", "unlisted");
  const inviteOnly = await repo.updateAccessType("comp_1", "invite_only");

  assert.equal(cancelled?.status, "cancelled");
  assert.equal(hidden?.visibility, "unlisted");
  assert.equal(inviteOnly?.accessType, "invite_only");
  assert.deepEqual(calls.map((call) => call.values), [
    ["comp_1"],
    ["comp_1", "unlisted"],
    ["comp_1", "invite_only"]
  ]);
  assert.equal(publishCalls.length, 3);
  assert.deepEqual(
    publishCalls.map((event) => (event as { collection: string; documentId: string; operation: string }).operation),
    ["upsert", "upsert", "upsert"]
  );
});

test("PgCompetitionDirectoryRepository returns null when competition updates miss", async () => {
  queryImpl = async () => ({ rows: [], rowCount: 0 });

  const repo = new PgCompetitionDirectoryRepository();

  assert.equal(await repo.getCompetition("missing"), null);
  assert.equal(await repo.cancelCompetition("missing"), null);
  assert.equal(await repo.updateVisibility("missing", "listed"), null);
  assert.equal(await repo.updateAccessType("missing", "open"), null);
  assert.equal(publishCalls.length, 0);
});
