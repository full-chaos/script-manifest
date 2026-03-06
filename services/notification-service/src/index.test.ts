import assert from "node:assert/strict";
import test from "node:test";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { NotificationRepository } from "./repository.js";

class MemoryNotificationRepository implements NotificationRepository {
  private readonly events: NotificationEventEnvelope[] = [];

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async pushEvent(event: NotificationEventEnvelope): Promise<void> {
    this.events.push(event);
  }

  async getEventsByTargetUser(targetUserId: string): Promise<NotificationEventEnvelope[]> {
    return this.events.filter((event) => event.targetUserId === targetUserId);
  }
}

test("notification service accepts valid events and lists by user", async (t) => {
  const memoryRepo = new MemoryNotificationRepository();
  const server = buildServer({ logger: false, repository: memoryRepo });
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
  const memoryRepo = new MemoryNotificationRepository();
  const server = buildServer({ logger: false, repository: memoryRepo });
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
