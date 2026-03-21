import assert from "node:assert/strict";
import test, { mock } from "node:test";

const query = mock.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(
  async () => ({ rows: [] }),
);

await mock.module("node:crypto", {
  namedExports: { randomUUID: () => "uuid-fixed" },
});

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
  },
});

const { PgUserPaymentProfileRepository } = await import("./userPaymentProfileRepository.js");

test("findByUserId returns null when no profile exists", async () => {
  query.mock.resetCalls();
  query.mock.mockImplementation(async () => ({ rows: [] }));

  const repo = new PgUserPaymentProfileRepository();
  const result = await repo.findByUserId("user-1");

  assert.strictEqual(result, null);
  assert.equal(query.mock.callCount(), 1);
  assert.match(query.mock.calls[0]!.arguments[0], /user_payment_profiles/);
  assert.deepEqual(query.mock.calls[0]!.arguments[1], ["user-1"]);
});

test("findByUserId returns profile when found", async () => {
  query.mock.resetCalls();
  query.mock.mockImplementation(async () => ({
    rows: [{ stripe_customer_id: "cus_abc123" }],
  }));

  const repo = new PgUserPaymentProfileRepository();
  const result = await repo.findByUserId("user-2");

  assert.ok(result !== null);
  assert.equal(result!.stripeCustomerId, "cus_abc123");
});

test("create inserts with generated UUID", async () => {
  query.mock.resetCalls();
  query.mock.mockImplementation(async () => ({ rows: [], rowCount: 1 }));

  const repo = new PgUserPaymentProfileRepository();
  await repo.create("user-3", "cus_xyz");

  assert.equal(query.mock.callCount(), 1);
  const sql = query.mock.calls[0]!.arguments[0];
  const values = query.mock.calls[0]!.arguments[1] as unknown[];
  assert.match(sql, /INSERT INTO user_payment_profiles/);
  assert.match(sql, /ON CONFLICT \(user_id\) DO NOTHING/);
  assert.equal(values[0], "uppr_uuid-fixed");
  assert.equal(values[1], "user-3");
  assert.equal(values[2], "cus_xyz");
});
