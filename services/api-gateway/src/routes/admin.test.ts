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

test("GET /api/v1/admin/users proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/users": { payload: { users: [], total: 0, page: 1, limit: 20 } }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/users?page=1&limit=20",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { users: unknown[]; total: number };
  assert.equal(body.total, 0);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/users")));
});

test("GET /api/v1/admin/users returns 403 without admin allowlist", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [] // empty allowlist
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/users",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});

test("GET /api/v1/admin/audit-log proxies to identity service", async (t) => {
  const { requestFn } = createMockRequestFn({
    "/internal/admin/audit-log": { payload: { entries: [], total: 0, page: 1, limit: 50 } }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/audit-log?page=1&limit=50",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { entries: unknown[]; total: number };
  assert.equal(body.total, 0);
});

test("POST /api/v1/reports proxies content report to identity service", async (t) => {
  const { requestFn } = createMockRequestFn({
    "/internal/reports": {
      payload: { report: { id: "rpt_1", status: "pending" } },
      statusCode: 201
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/reports",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { contentType: "script", contentId: "s_1", reason: "spam" }
  });

  assert.equal(res.statusCode, 201);
});

test("GET /api/v1/admin/moderation/queue requires admin", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: []
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/moderation/queue",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});

test("GET /api/v1/admin/metrics aggregates from multiple services", async (t) => {
  const { requestFn } = createMockRequestFn({
    "/internal/admin/metrics": {
      payload: { metrics: { totalUsers: 100, activeUsers30d: 25, pendingReports: 3 } }
    },
    "/internal/appeals": { payload: { appeals: [{ id: "a1" }, { id: "a2" }] } },
    "/internal/flags": { payload: { flags: [{ id: "f1" }] } },
    "/internal/profiles": { payload: { total: 50 } }
  });

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/metrics",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { metrics: { totalUsers: number; pendingAppeals: number; pendingFlags: number } };
  assert.equal(body.metrics.totalUsers, 100);
  assert.equal(body.metrics.pendingAppeals, 2);
  assert.equal(body.metrics.pendingFlags, 1);
});
