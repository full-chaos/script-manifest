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

    // IP block check endpoint — not blocked (for the ipBlocklist plugin)
    if (String(url).includes("/internal/admin/ip-blocks/check/")) {
      return jsonResponse({ blocked: false });
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

test("POST /api/v1/admin/users/:id/suspend proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/users/user_1/suspend": {
      payload: { suspension: { id: "susp_1", userId: "user_1", reason: "spam", durationDays: 7 } },
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
    url: "/api/v1/admin/users/user_1/suspend",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { reason: "spam", durationDays: 7 }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/users/user_1/suspend") && c.method === "POST"));
});

test("POST /api/v1/admin/users/:id/suspend returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: []
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/users/user_1/suspend",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { reason: "spam" }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /api/v1/admin/users/:id/suspend validates request body", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: [ADMIN_USER_ID]
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/users/user_1/suspend",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { reason: "" }
  });

  assert.equal(res.statusCode, 400);
});

test("POST /api/v1/admin/users/:id/ban proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/users/user_1/ban": {
      payload: { suspension: { id: "susp_1", userId: "user_1", reason: "abuse", durationDays: null } },
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
    url: "/api/v1/admin/users/user_1/ban",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { reason: "Repeated abuse" }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/users/user_1/ban")));
});

test("POST /api/v1/admin/users/:id/unsuspend proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/users/user_1/unsuspend": {
      payload: { ok: true }
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
    url: "/api/v1/admin/users/user_1/unsuspend",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/users/user_1/unsuspend")));
});

test("GET /api/v1/admin/users/:id/suspensions proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/users/user_1/suspensions": {
      payload: { suspensions: [] }
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
    url: "/api/v1/admin/users/user_1/suspensions",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/users/user_1/suspensions")));
});

test("GET /api/v1/admin/users/:id/suspensions returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn,
    adminAllowlist: []
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/users/user_1/suspensions",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});
