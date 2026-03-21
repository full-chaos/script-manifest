import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult<T> = { rows: T[]; rowCount?: number };

const ensureTables = mock.fn(async () => {});
const query = mock.fn<(sql: string, params?: unknown[]) => Promise<QueryResult<unknown>>>(
  async () => ({ rows: [] }),
);
const release = mock.fn();

await mock.module("node:crypto", {
  namedExports: { randomUUID: () => "uuid-fixed" },
});

await mock.module("@script-manifest/db", {
  namedExports: {
    ensureCoverageMarketplaceTables: ensureTables,
    getPool: () => ({
      query,
      connect: async () => ({ query, release }),
    }),
  },
});

const { PgCoverageMarketplaceRepository } = await import("./pgRepository.js");

test.beforeEach(() => {
  query.mock.resetCalls();
  ensureTables.mock.resetCalls();
  release.mock.resetCalls();
});

test("init calls ensureCoverageMarketplaceTables", async () => {
  const repo = new PgCoverageMarketplaceRepository();
  await repo.init();
  assert.equal(ensureTables.mock.callCount(), 1);
});

test("healthCheck returns { database: true } on successful query", async () => {
  query.mock.mockImplementation(async () => ({ rows: [{ "?column?": 1 }] }));
  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.healthCheck();
  assert.deepEqual(result, { database: true });
});

test("healthCheck returns { database: false } when query throws", async () => {
  query.mock.mockImplementation(async () => {
    throw new Error("connection refused");
  });
  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.healthCheck();
  assert.deepEqual(result, { database: false });
});

test("createProvider inserts with generated ID and pending_verification status", async () => {
  query.mock.mockImplementation(async () => ({
    rows: [{
      id: "cprov_uuid-fixed",
      user_id: "user-1",
      display_name: "Writer Pro",
      bio: "Expert coverage",
      specialties: ["drama", "comedy"],
      status: "pending_verification",
      stripe_account_id: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    }],
  }));

  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.createProvider("user-1", {
    displayName: "Writer Pro",
    bio: "Expert coverage",
    specialties: ["drama", "comedy"],
  });

  assert.equal(result.id, "cprov_uuid-fixed");
  assert.equal(result.status, "pending_verification");
  assert.equal(query.mock.callCount(), 1);
  const [sql, values] = query.mock.calls[0]!.arguments as [string, unknown[]];
  assert.match(sql, /INSERT INTO coverage_providers/);
  assert.equal(values[0], "cprov_uuid-fixed");
  assert.equal(values[1], "user-1");
});

test("getProvider returns null for unknown ID", async () => {
  query.mock.mockImplementation(async () => ({ rows: [] }));
  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.getProvider("cprov_unknown");
  assert.strictEqual(result, null);
});

test("getProvider returns mapped provider for known ID", async () => {
  query.mock.mockImplementation(async () => ({
    rows: [{
      id: "cprov_1",
      user_id: "user-1",
      display_name: "Writer Pro",
      bio: "Expert",
      specialties: ["drama"],
      status: "active",
      stripe_account_id: "acct_123",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    }],
  }));

  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.getProvider("cprov_1");
  assert.ok(result !== null);
  assert.equal(result!.id, "cprov_1");
  assert.equal(result!.displayName, "Writer Pro");
  assert.equal(result!.status, "active");
});

test("listProviders passes filters to query", async () => {
  query.mock.mockImplementation(async () => ({ rows: [] }));
  const repo = new PgCoverageMarketplaceRepository();
  await repo.listProviders({ status: "active", limit: 10, offset: 0 });

  assert.equal(query.mock.callCount(), 1);
  const [sql] = query.mock.calls[0]!.arguments as [string];
  assert.match(sql, /coverage_providers/);
});
