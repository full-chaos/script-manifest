import assert from "node:assert/strict";
import test from "node:test";
import { closePool, getPool } from "@script-manifest/db";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import { PgNotificationRepository } from "./pgRepository.js";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

test.afterEach(async () => {
  if (ORIGINAL_DATABASE_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  }
});

function setMockPool(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
  return getPool(databaseUrl);
}

test("PgNotificationRepository healthCheck returns true when query succeeds", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/notification_repo_true";
  const pool = setMockPool(databaseUrl);
  t.mock.method(pool, "query", async () => ({ rows: [] }) as never);

  const repo = new PgNotificationRepository();
  const result = await repo.healthCheck();

  assert.deepEqual(result, { database: true });
  await closePool(databaseUrl);
});

test("PgNotificationRepository healthCheck returns false when query throws", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/notification_repo_false";
  const pool = setMockPool(databaseUrl);
  t.mock.method(pool, "query", async () => {
    throw new Error("down");
  });

  const repo = new PgNotificationRepository();
  const result = await repo.healthCheck();

  assert.deepEqual(result, { database: false });
  await closePool(databaseUrl);
});

test("PgNotificationRepository pushEvent inserts expected values", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/notification_repo_push";
  const pool = setMockPool(databaseUrl);
  let capturedQuery = "";
  let capturedValues: readonly unknown[] = [];

  t.mock.method(pool, "query", async (queryText: string, values?: readonly unknown[]) => {
    capturedQuery = queryText;
    capturedValues = values ?? [];
    return { rows: [] } as never;
  });

  const repo = new PgNotificationRepository();
  const event: NotificationEventEnvelope = {
    eventId: "evt_1",
    eventType: "script_downloaded",
    occurredAt: "2026-03-01T10:00:00.000Z",
    actorUserId: undefined,
    targetUserId: "writer_1",
    resourceType: "script",
    resourceId: "script_1",
    payload: { source: "test" },
  };

  await repo.pushEvent(event);

  assert.ok(capturedQuery.includes("INSERT INTO notification_events"));
  assert.equal(capturedValues[1], "evt_1");
  assert.equal(capturedValues[4], null);
  assert.equal(capturedValues[5], "writer_1");
  await closePool(databaseUrl);
});

test("PgNotificationRepository getEventsByTargetUser maps rows to envelopes", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/notification_repo_get";
  const pool = setMockPool(databaseUrl);
  let capturedValues: readonly unknown[] = [];

  t.mock.method(pool, "query", async (_queryText: string, values?: readonly unknown[]) => {
    capturedValues = values ?? [];
    return {
      rows: [
        {
          id: "db_1",
          event_id: "evt_2",
          event_type: "coverage_marketplace_match",
          occurred_at: new Date("2026-03-01T10:00:00.000Z"),
          read_at: new Date("2026-03-01T11:00:00.000Z"),
          actor_user_id: null,
          target_user_id: "writer_2",
          resource_type: "coverage",
          resource_id: "cov_2",
          payload: { score: 9 },
          created_at: new Date("2026-03-01T10:00:01.000Z"),
        },
      ],
    } as never;
  });

  const repo = new PgNotificationRepository();
  const events = await repo.getEventsByTargetUser("writer_2", 20, 5);

  assert.deepEqual(capturedValues, ["writer_2", 20, 5]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventId, "evt_2");
  assert.equal(events[0]?.actorUserId, undefined);
  assert.equal(events[0]?.readAt, "2026-03-01T11:00:00.000Z");
  await closePool(databaseUrl);
});

test("PgNotificationRepository markEventRead and getUnreadCount return mapped results", async (t) => {
  const databaseUrl = "postgresql://manifest:manifest@localhost:5432/notification_repo_counts";
  const pool = setMockPool(databaseUrl);
  let callIndex = 0;

  t.mock.method(pool, "query", async () => {
    callIndex += 1;
    if (callIndex === 1) {
      return { rows: [], rowCount: 1 } as never;
    }
    if (callIndex === 2) {
      return { rows: [], rowCount: 0 } as never;
    }
    return { rows: [{ count: "7" }] } as never;
  });

  const repo = new PgNotificationRepository();
  const firstRead = await repo.markEventRead("evt_3", "writer_3");
  const secondRead = await repo.markEventRead("evt_3", "writer_3");
  const unreadCount = await repo.getUnreadCount("writer_3");

  assert.equal(firstRead, true);
  assert.equal(secondRead, false);
  assert.equal(unreadCount, 7);
  await closePool(databaseUrl);
});
