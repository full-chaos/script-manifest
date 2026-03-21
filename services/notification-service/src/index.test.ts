import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { signServiceToken } from "@script-manifest/service-utils";
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

  async getEventsByTargetUser(targetUserId: string, _limit?: number, _offset?: number): Promise<NotificationEventEnvelope[]> {
    return this.events.filter((event) => event.targetUserId === targetUserId);
  }

  async markEventRead(eventId: string, targetUserId: string): Promise<boolean> {
    const index = this.events.findIndex((event) => event.eventId === eventId && event.targetUserId === targetUserId && !event.readAt);
    if (index < 0) {
      return false;
    }
    const event = this.events[index];
    if (!event) {
      return false;
    }
    this.events[index] = { ...event, readAt: new Date().toISOString() };
    return true;
  }

  async getUnreadCount(targetUserId: string): Promise<number> {
    return this.events.filter((event) => event.targetUserId === targetUserId && !event.readAt).length;
  }
}

const SERVICE_SECRET = randomBytes(32).toString("hex");
const SERVICE_USER_ID = "service_01";

function serviceHeaders(): Record<string, string> {
  return {
    "x-auth-user-id": SERVICE_USER_ID,
    "x-service-token": signServiceToken({ sub: SERVICE_USER_ID, role: "writer" }, SERVICE_SECRET),
    "content-type": "application/json"
  };
}

function noAuthHeaders(): Record<string, string> {
  return {
    "content-type": "application/json"
  };
}

function createServer() {
  const originalSecret = process.env.SERVICE_TOKEN_SECRET;
  process.env.SERVICE_TOKEN_SECRET = SERVICE_SECRET;

  const memoryRepo = new MemoryNotificationRepository();
  const server = buildServer({ logger: false, repository: memoryRepo });

  return {
    server,
    cleanup() {
      if (originalSecret === undefined) {
        delete process.env.SERVICE_TOKEN_SECRET;
      } else {
        process.env.SERVICE_TOKEN_SECRET = originalSecret;
      }
    }
  };
}

test("notification service accepts valid events and lists by user", async (t) => {
  const { server, cleanup } = createServer();
  t.after(async () => {
    await server.close();
    cleanup();
  });

  const eventResponse = await server.inject({
    method: "POST",
    url: "/internal/events",
    headers: serviceHeaders(),
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
    url: "/internal/events/writer_01",
    headers: serviceHeaders()
  });
  assert.equal(listResponse.statusCode, 200);
  const payload = listResponse.json();
  assert.equal(payload.events.length, 1);
});

test("notification service rejects events without service token", async (t) => {
  const { server, cleanup } = createServer();
  t.after(async () => {
    await server.close();
    cleanup();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/events",
    headers: noAuthHeaders(),
    payload: {
      eventId: "evt_2",
      eventType: "script_downloaded",
      occurredAt: "2026-02-06T10:00:00Z",
      targetUserId: "writer_01",
      resourceType: "script",
      resourceId: "script_01",
      payload: {}
    }
  });

  assert.equal(response.statusCode, 403);
});

test("notification service rejects GET events without service token", async (t) => {
  const { server, cleanup } = createServer();
  t.after(async () => {
    await server.close();
    cleanup();
  });

  const response = await server.inject({
    method: "GET",
    url: "/internal/events/writer_01",
    headers: noAuthHeaders()
  });

  assert.equal(response.statusCode, 403);
});

test("notification service rejects invalid events", async (t) => {
  const { server, cleanup } = createServer();
  t.after(async () => {
    await server.close();
    cleanup();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/events",
    headers: serviceHeaders(),
    payload: { invalid: true }
  });

  assert.equal(response.statusCode, 400);
});
