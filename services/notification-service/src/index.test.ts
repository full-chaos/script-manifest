import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";

test("notification service accepts valid events and lists by user", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  const eventResponse = await server.inject({
    method: "POST",
    url: "/internal/events",
    payload: {
      eventId: "evt_1",
      eventType: "script_downloaded",
      occurredAt: "2026-02-06T10:00:00Z",
      targetUserId: "writer_01",
      resourceType: "script",
      resourceId: "script_01",
      payload: { source: "test" }
    }
  });

  assert.equal(eventResponse.statusCode, 202);

  const listResponse = await server.inject({
    method: "GET",
    url: "/internal/events/writer_01"
  });
  assert.equal(listResponse.statusCode, 200);
  const payload = listResponse.json();
  assert.equal(payload.events.length, 1);
});

test("notification service rejects invalid events", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/events",
    payload: { invalid: true }
  });

  assert.equal(response.statusCode, 400);
});
