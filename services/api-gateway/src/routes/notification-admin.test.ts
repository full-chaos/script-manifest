import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      dump: async () => undefined
    }
  } as RequestResult;
}

const ADMIN_USER_ID = "admin_01";

function createMockRequestFn(responses: Record<string, { payload: unknown; statusCode?: number }>) {
  const calls: { url: string; method: string }[] = [];

  const requestFn = (async (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), method: options?.method ?? "GET" });

    // Auth endpoint — return admin user
    if (String(url).includes("/internal/auth/me")) {
      return jsonResponse({ user: { id: ADMIN_USER_ID, email: "admin@test.com", displayName: "Admin", role: "admin" } });
    }

    // Match response by URL pattern
    for (const [pattern, response] of Object.entries(responses)) {
      if (String(url).includes(pattern)) {
        return jsonResponse(response.payload, response.statusCode ?? 200);
      }
    }

    return jsonResponse({ error: "not_found" }, 404);
  }) as typeof request;

  return { requestFn, calls };
}

// ── Template Routes ─────────────────────────────────────────────

test("POST /api/v1/admin/notifications/templates proxies to notification service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/notifications/templates": {
      payload: { template: { id: "tpl_1", name: "Test", status: "active" } },
      statusCode: 201
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/templates",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: {
      name: "Test Template",
      subject: "Test Subject",
      bodyTemplate: "Test Body",
      category: "general"
    }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/notifications/templates") && c.method === "POST"));
});

test("POST /api/v1/admin/notifications/templates returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: []
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/templates",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: {
      name: "Test",
      subject: "Test",
      bodyTemplate: "Test",
      category: "general"
    }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /api/v1/admin/notifications/templates returns 400 for invalid payload", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/templates",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { name: "" }
  });

  assert.equal(res.statusCode, 400);
});

test("GET /api/v1/admin/notifications/templates proxies to notification service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/notifications/templates": {
      payload: { templates: [] }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/notifications/templates",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/notifications/templates") && c.method === "GET"));
});

// ── Broadcast Routes ────────────────────────────────────────────

test("POST /api/v1/admin/notifications/broadcast proxies to notification service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/notifications/broadcast": {
      payload: { broadcast: { id: "bc_1", status: "sent", recipientCount: 100 } },
      statusCode: 201
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/broadcast",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: {
      subject: "System Update",
      body: "Maintenance tonight.",
      audience: "all"
    }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/notifications/broadcast") && c.method === "POST"));
});

test("POST /api/v1/admin/notifications/broadcast returns 400 for invalid payload", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/broadcast",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { subject: "" }
  });

  assert.equal(res.statusCode, 400);
});

// ── Direct Notification Routes ──────────────────────────────────

test("POST /api/v1/admin/notifications/direct proxies to notification service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/notifications/direct": {
      payload: { broadcast: { id: "bc_2", audience: "user:u_1", recipientCount: 1, status: "sent" } },
      statusCode: 201
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/direct",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: {
      userId: "u_1",
      subject: "Personal Notice",
      body: "Check your inbox."
    }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/notifications/direct") && c.method === "POST"));
});

test("POST /api/v1/admin/notifications/direct returns 400 for missing userId", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/notifications/direct",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { subject: "Test", body: "Test" }
  });

  assert.equal(res.statusCode, 400);
});

// ── History Routes ──────────────────────────────────────────────

test("GET /api/v1/admin/notifications/history proxies to notification service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/notifications/history": {
      payload: { broadcasts: [], total: 0, page: 1, limit: 20 }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/notifications/history?page=1&limit=20",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { total: number };
  assert.equal(body.total, 0);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/notifications/history") && c.method === "GET"));
});

test("GET /api/v1/admin/notifications/history returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: []
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/notifications/history",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});
