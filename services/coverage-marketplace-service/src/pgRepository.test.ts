import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult<T> = { rows: T[]; rowCount?: number };

const providerRow = {
  id: "cprov_1",
  user_id: "user-1",
  display_name: "Writer Pro",
  bio: "Expert",
  specialties: ["drama"],
  status: "active",
  stripe_account_id: "acct_123",
  stripe_onboarding_complete: true,
  verification_state: "unverified",
  verified_at: null,
  verified_by_user_id: null,
  verification_notes: null,
  verification_updated_at: new Date("2026-01-01T00:00:00.000Z"),
  avg_rating: null,
  total_orders_completed: 0,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

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
      ...providerRow,
      id: "cprov_uuid-fixed",
      bio: "Expert coverage",
      specialties: ["drama", "comedy"],
      status: "pending_verification",
      stripe_account_id: null,
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
    rows: [providerRow],
  }));

  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.getProvider("cprov_1");
  assert.ok(result !== null);
  assert.equal(result!.id, "cprov_1");
  assert.equal(result!.displayName, "Writer Pro");
  assert.equal(result!.status, "active");
  assert.equal(result!.verificationState, "unverified");
  assert.equal(result!.badge.kind, "unverified_provider");
});

test("listProviders passes status and verification filters to query", async () => {
  query.mock.mockImplementation(async () => ({ rows: [] }));
  const repo = new PgCoverageMarketplaceRepository();
  await repo.listProviders({ status: "active", verificationState: "verified", limit: 10, offset: 0 });

  assert.equal(query.mock.callCount(), 1);
  const [sql] = query.mock.calls[0]!.arguments as [string];
  assert.match(sql, /coverage_providers/);
  assert.match(sql, /verification_state/);
});

test("updateProviderVerification updates provider and inserts domain event in a transaction", async () => {
  query.mock.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT * FROM coverage_providers")) {
      return { rows: [providerRow] };
    }
    if (sql.includes("UPDATE coverage_providers")) {
      return {
        rows: [{
          ...providerRow,
          verification_state: "verified",
          verified_at: new Date("2026-05-24T12:00:00.000Z"),
          verified_by_user_id: "admin_01",
          verification_notes: "Identity reviewed",
          verification_updated_at: new Date("2026-05-24T12:00:00.000Z"),
        }],
      };
    }
    return { rows: [] };
  });

  const repo = new PgCoverageMarketplaceRepository();
  const result = await repo.updateProviderVerification("cprov_1", "admin_01", {
    state: "verified",
    reason: "Identity reviewed",
    checklist: ["identity", "references"],
  });

  assert.equal(result?.verificationState, "verified");
  assert.equal(result?.badge.kind, "verified_provider");
  const sqlStatements = query.mock.calls.map((call) => String(call.arguments[0]));
  assert.match(sqlStatements.join("\n"), /BEGIN/);
  assert.match(sqlStatements.join("\n"), /INSERT INTO provider_verification_events/);
  assert.match(sqlStatements.join("\n"), /COMMIT/);
  assert.equal(release.mock.callCount(), 1);
});

test("updateProviderStripe leaves verification_state untouched", async () => {
  query.mock.mockImplementation(async () => ({ rows: [providerRow] }));
  const repo = new PgCoverageMarketplaceRepository();
  await repo.updateProviderStripe("cprov_1", "acct_123", true);

  const [sql] = query.mock.calls[0]!.arguments as [string];
  assert.doesNotMatch(sql, /verification_state/);
});

test("listProviderVerificationEvents maps event history", async () => {
  query.mock.mockImplementation(async () => ({
    rows: [{
      id: "pve_1",
      provider_id: "cprov_1",
      admin_user_id: "admin_01",
      from_state: "unverified",
      to_state: "verified",
      reason: "Identity reviewed",
      checklist: ["identity"],
      created_at: new Date("2026-05-24T12:00:00.000Z"),
    }],
  }));

  const repo = new PgCoverageMarketplaceRepository();
  const events = await repo.listProviderVerificationEvents("cprov_1");

  assert.equal(events[0]?.toState, "verified");
  assert.equal(events[0]?.checklist[0], "identity");
});
