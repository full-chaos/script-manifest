import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { signServiceToken } from "@script-manifest/service-utils";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { NotificationRepository } from "./repository.js";
import { MemoryNotificationAdminRepository } from "./admin-repository.js";

// ── Memory notification repository for base server ──────────────

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

// ── Test helpers ────────────────────────────────────────────────

const SERVICE_SECRET = randomBytes(32).toString("hex");
const ADMIN_USER_ID = "admin_01";

function adminHeaders(): Record<string, string> {
  return {
    "x-auth-user-id": ADMIN_USER_ID,
    "x-service-token": signServiceToken({ sub: ADMIN_USER_ID, role: "admin" }, SERVICE_SECRET),
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
  const adminRepo = new MemoryNotificationAdminRepository();
  const server = buildServer({ logger: false, repository: memoryRepo, adminRepository: adminRepo });

  return {
    server,
    cleanup: async () => {
      await server.close();
      if (originalSecret !== undefined) {
        process.env.SERVICE_TOKEN_SECRET = originalSecret;
      } else {
        delete process.env.SERVICE_TOKEN_SECRET;
      }
    }
  };
}

// ── Template Tests ──────────────────────────────────────────────

test("POST /internal/admin/notifications/templates creates a template", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/templates",
    headers: adminHeaders(),
    payload: {
      name: "Welcome Email",
      subject: "Welcome!",
      bodyTemplate: "Hello {{name}}!",
      category: "general"
    }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json() as { template: { id: string; name: string; status: string } };
  assert.ok(body.template.id);
  assert.equal(body.template.name, "Welcome Email");
  assert.equal(body.template.status, "active");
});

test("POST /internal/admin/notifications/templates returns 403 without admin auth", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/templates",
    headers: noAuthHeaders(),
    payload: {
      name: "Test",
      subject: "Test",
      bodyTemplate: "Test",
      category: "general"
    }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /internal/admin/notifications/templates returns 400 for invalid payload", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/templates",
    headers: adminHeaders(),
    payload: { name: "" } // missing required fields
  });

  assert.equal(res.statusCode, 400);
});

test("GET /internal/admin/notifications/templates lists templates", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  // Create a template first
  await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/templates",
    headers: adminHeaders(),
    payload: {
      name: "Template 1",
      subject: "Subject 1",
      bodyTemplate: "Body 1",
      category: "general"
    }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/notifications/templates",
    headers: adminHeaders()
  });

  assert.equal(res.statusCode, 200);
  const body = res.json() as { templates: unknown[] };
  assert.equal(body.templates.length, 1);
});

test("GET /internal/admin/notifications/templates returns 403 without admin auth", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/notifications/templates",
    headers: noAuthHeaders()
  });

  assert.equal(res.statusCode, 403);
});

// ── Broadcast Tests ─────────────────────────────────────────────

test("POST /internal/admin/notifications/broadcast creates and sends a broadcast", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/broadcast",
    headers: adminHeaders(),
    payload: {
      subject: "System Update",
      body: "We will be performing maintenance tonight.",
      audience: "all"
    }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json() as { broadcast: { id: string; status: string; recipientCount: number } };
  assert.ok(body.broadcast.id);
  assert.equal(body.broadcast.status, "sent");
  assert.ok(body.broadcast.recipientCount > 0);
});

test("POST /internal/admin/notifications/broadcast returns 403 without admin auth", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/broadcast",
    headers: noAuthHeaders(),
    payload: {
      subject: "Test",
      body: "Test body",
      audience: "all"
    }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /internal/admin/notifications/broadcast returns 400 for invalid payload", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/broadcast",
    headers: adminHeaders(),
    payload: { subject: "" } // invalid
  });

  assert.equal(res.statusCode, 400);
});

// ── Direct Notification Tests ───────────────────────────────────

test("POST /internal/admin/notifications/direct sends to specific user", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/direct",
    headers: adminHeaders(),
    payload: {
      userId: "user_42",
      subject: "Important Notice",
      body: "You have a new message."
    }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json() as { broadcast: { audience: string; recipientCount: number; status: string } };
  assert.equal(body.broadcast.audience, "user:user_42");
  assert.equal(body.broadcast.recipientCount, 1);
  assert.equal(body.broadcast.status, "sent");
});

test("POST /internal/admin/notifications/direct returns 403 without admin auth", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/direct",
    headers: noAuthHeaders(),
    payload: {
      userId: "user_42",
      subject: "Test",
      body: "Test"
    }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /internal/admin/notifications/direct returns 400 for missing userId", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/direct",
    headers: adminHeaders(),
    payload: {
      subject: "Test",
      body: "Test"
      // missing userId
    }
  });

  assert.equal(res.statusCode, 400);
});

// ── History Tests ───────────────────────────────────────────────

test("GET /internal/admin/notifications/history returns broadcast history", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  // Create a broadcast first
  await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/broadcast",
    headers: adminHeaders(),
    payload: {
      subject: "Past Broadcast",
      body: "This was sent earlier.",
      audience: "all"
    }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/notifications/history?page=1&limit=20",
    headers: adminHeaders()
  });

  assert.equal(res.statusCode, 200);
  const body = res.json() as { broadcasts: unknown[]; total: number; page: number; limit: number };
  assert.equal(body.broadcasts.length, 1);
  assert.equal(body.total, 1);
  assert.equal(body.page, 1);
  assert.equal(body.limit, 20);
});

test("GET /internal/admin/notifications/history returns 403 without admin auth", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/notifications/history?page=1&limit=20",
    headers: noAuthHeaders()
  });

  assert.equal(res.statusCode, 403);
});

test("GET /internal/admin/notifications/history supports status filter", async (t) => {
  const { server, cleanup } = createServer();
  t.after(cleanup);

  // Create a sent broadcast
  await server.inject({
    method: "POST",
    url: "/internal/admin/notifications/broadcast",
    headers: adminHeaders(),
    payload: {
      subject: "Sent Broadcast",
      body: "Body",
      audience: "all"
    }
  });

  // Filter by 'pending' — should return none since broadcast was auto-sent
  const res = await server.inject({
    method: "GET",
    url: "/internal/admin/notifications/history?page=1&limit=20&status=pending",
    headers: adminHeaders()
  });

  assert.equal(res.statusCode, 200);
  const body = res.json() as { broadcasts: unknown[]; total: number };
  assert.equal(body.broadcasts.length, 0);
  assert.equal(body.total, 0);
});
