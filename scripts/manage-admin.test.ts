import assert from "node:assert/strict";
import test from "node:test";
import { runManageAdmin } from "./manage-admin.js";

type QueryResult = { rows: Array<Record<string, unknown>> };

function buildHarness(query: (sql: string, values?: unknown[]) => Promise<QueryResult>) {
  const logs: string[] = [];
  const errors: string[] = [];
  let closeCalled = 0;

  const deps = {
    getPool: () => ({
      query: async (sql: string, values?: unknown[]) => query(sql, values)
    }),
    closePool: async () => {
      closeCalled += 1;
    },
    log: (message: string) => {
      logs.push(message);
    },
    error: (message: string) => {
      errors.push(message);
    },
    exit: (code: number) => {
      const error = new Error(`process_exit_${code}`) as Error & { code: number };
      error.code = code;
      throw error;
    }
  };

  return {
    deps,
    logs,
    errors,
    getCloseCalled: () => closeCalled
  };
}

test("promote shows success message with user info", async () => {
  const harness = buildHarness(async () => ({
    rows: [{ id: "admin_01", email: "admin@test.com", display_name: "Admin User" }]
  }));

  await runManageAdmin(["promote", "admin@test.com"], harness.deps);

  assert.equal(harness.errors.length, 0);
  assert.equal(harness.getCloseCalled(), 1);
  assert.match(harness.logs[0] ?? "", /Promoted Admin User <admin@test\.com> \[admin_01\] to admin/);
});

test("promote exits with error for unknown user", async () => {
  const harness = buildHarness(async () => ({ rows: [] }));

  await assert.rejects(
    () => runManageAdmin(["promote", "missing@test.com"], harness.deps),
    (error: Error & { code?: number }) => error.code === 1
  );

  assert.equal(harness.getCloseCalled(), 0);
  assert.equal(harness.errors[0], "User not found: missing@test.com");
});

test("demote shows success message", async () => {
  const harness = buildHarness(async () => ({
    rows: [{ id: "admin_01", email: "admin@test.com", display_name: "Admin User" }]
  }));

  await runManageAdmin(["demote", "admin@test.com"], harness.deps);

  assert.equal(harness.errors.length, 0);
  assert.equal(harness.getCloseCalled(), 1);
  assert.match(harness.logs[0] ?? "", /Demoted Admin User <admin@test\.com> \[admin_01\] to writer/);
});

test("demote exits with error for non-admin user", async () => {
  const harness = buildHarness(async () => ({ rows: [] }));

  await assert.rejects(
    () => runManageAdmin(["demote", "writer@test.com"], harness.deps),
    (error: Error & { code?: number }) => error.code === 1
  );

  assert.equal(harness.getCloseCalled(), 0);
  assert.equal(harness.errors[0], "Admin user not found: writer@test.com");
});

test("list shows admin users", async () => {
  const harness = buildHarness(async () => ({
    rows: [
      {
        id: "admin_01",
        email: "admin1@test.com",
        display_name: "Admin One",
        created_at: new Date("2026-01-01T00:00:00.000Z")
      },
      {
        id: "admin_02",
        email: "admin2@test.com",
        display_name: "Admin Two",
        created_at: new Date("2026-01-02T00:00:00.000Z")
      }
    ]
  }));

  await runManageAdmin(["list"], harness.deps);

  assert.equal(harness.errors.length, 0);
  assert.equal(harness.getCloseCalled(), 1);
  assert.ok(harness.logs.some((line) => line.includes("Admin users (2):")));
  assert.ok(harness.logs.some((line) => line.includes("Admin One <admin1@test.com> [admin_01]")));
  assert.ok(harness.logs.some((line) => line.includes("Admin Two <admin2@test.com> [admin_02]")));
});

test("list shows no admin users when empty", async () => {
  const harness = buildHarness(async () => ({ rows: [] }));

  await runManageAdmin(["list"], harness.deps);

  assert.equal(harness.errors.length, 0);
  assert.equal(harness.getCloseCalled(), 1);
  assert.equal(harness.logs[0], "No admin users found.");
});

test("unknown command shows usage", async () => {
  const harness = buildHarness(async () => ({ rows: [] }));

  await assert.rejects(
    () => runManageAdmin(["unknown"], harness.deps),
    (error: Error & { code?: number }) => error.code === 1
  );

  assert.equal(harness.getCloseCalled(), 0);
  assert.equal(harness.errors[0], "Usage: manage-admin <promote|demote|list> [email]");
});
