import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    ensureFeedbackExchangeTables: async () => undefined
  }
});

const { PgFeedbackExchangeRepository } = await import("./repository.js");

test("PgFeedbackExchangeRepository listListings builds filtered query and pagination", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return { rows: [] };
  };

  const repo = new PgFeedbackExchangeRepository();
  const listings = await repo.listListings({
    status: "open",
    genre: "drama",
    format: "feature",
    ownerUserId: "writer_1",
    limit: 10,
    offset: 20
  });

  assert.deepEqual(listings, []);
  assert.match(capturedSql, /FROM feedback_listings/);
  assert.match(capturedSql, /status = \$1/);
  assert.match(capturedSql, /genre = \$2/);
  assert.match(capturedSql, /format = \$3/);
  assert.match(capturedSql, /owner_user_id = \$4/);
  assert.match(capturedSql, /LIMIT \$5/);
  assert.match(capturedSql, /OFFSET \$6/);
  assert.deepEqual(capturedValues, ["open", "drama", "feature", "writer_1", 10, 20]);
});

test("PgFeedbackExchangeRepository createTransaction maps DB row", async () => {
  queryImpl = async () => ({
    rows: [
      {
        id: "txn_1",
        idempotency_key: "idem_1",
        debit_user_id: "SYSTEM",
        credit_user_id: "writer_1",
        amount: 3,
        reason: "signup_grant",
        reference_type: "",
        reference_id: "",
        created_at: "2026-03-01T00:00:00.000Z"
      }
    ]
  });

  const repo = new PgFeedbackExchangeRepository();
  const txn = await repo.createTransaction({
    idempotencyKey: "idem_1",
    debitUserId: "SYSTEM",
    creditUserId: "writer_1",
    amount: 3,
    reason: "signup_grant"
  });

  assert.equal(txn.id, "txn_1");
  assert.equal(txn.idempotencyKey, "idem_1");
  assert.equal(txn.debitUserId, "SYSTEM");
  assert.equal(txn.creditUserId, "writer_1");
  assert.equal(txn.amount, 3);
  assert.equal(txn.reason, "signup_grant");
});
