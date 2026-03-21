import assert from "node:assert/strict";
import test from "node:test";
import { closePool, getPool } from "@script-manifest/db";
import { PgIdentityRepository, hashPassword, verifyPassword } from "./repository.js";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(async () => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});

test("hashPassword is deterministic for same password and salt", () => {
  const hash1 = hashPassword("hunter2", "salt123");
  const hash2 = hashPassword("hunter2", "salt123");
  const hash3 = hashPassword("hunter2", "different_salt");

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test("verifyPassword validates correct password and rejects invalid password", () => {
  const salt = "salt123";
  const hash = hashPassword("correct_password", salt);

  assert.equal(verifyPassword("correct_password", hash, salt), true);
  assert.equal(verifyPassword("wrong_password", hash, salt), false);
});

test("PgIdentityRepository healthCheck returns true when query succeeds", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/identity_repo_test_true";
  process.env.DATABASE_URL = databaseUrl;
  const pool = getPool(databaseUrl);

  t.mock.method(pool, "query", async () => ({ rows: [] }) as never);

  const repo = new PgIdentityRepository();
  const status = await repo.healthCheck();

  assert.deepEqual(status, { database: true });
  await closePool(databaseUrl);
});

test("PgIdentityRepository healthCheck returns false when query throws", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/identity_repo_test_false";
  process.env.DATABASE_URL = databaseUrl;
  const pool = getPool(databaseUrl);

  t.mock.method(pool, "query", async () => {
    throw new Error("db unavailable");
  });

  const repo = new PgIdentityRepository();
  const status = await repo.healthCheck();

  assert.deepEqual(status, { database: false });
  await closePool(databaseUrl);
});
