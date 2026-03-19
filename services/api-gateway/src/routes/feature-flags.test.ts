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

function createMockRequestFn(
  responses: Record<string, { payload: unknown; statusCode?: number }>,
  authRole = "admin"
) {
  const calls: { url: string; method: string; headers?: Record<string, string> }[] = [];

  const requestFn = (async (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), method: options?.method ?? "GET", headers: options?.headers });

    // Auth endpoint — return user based on token
    if (String(url).includes("/internal/auth/me")) {
      return jsonResponse({ user: { id: ADMIN_USER_ID, email: "admin@test.com", displayName: "Admin", role: authRole } });
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

test("GET /api/v1/admin/feature-flags proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/feature-flags": {
      payload: { flags: [{ key: "dark_mode", enabled: true }] }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/feature-flags",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { flags: { key: string }[] };
  assert.equal(body.flags.length, 1);
  assert.equal(body.flags[0]!.key, "dark_mode");
  assert.ok(calls.some(c => c.url.includes("/internal/admin/feature-flags")));
});

test("GET /api/v1/admin/feature-flags returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({}, "writer");

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/feature-flags",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /api/v1/admin/feature-flags creates flag", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/feature-flags": {
      payload: { flag: { key: "new_flag", enabled: false } },
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
    url: "/api/v1/admin/feature-flags",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { key: "new_flag", description: "A new flag" }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/feature-flags") && c.method === "POST"));
});

test("POST /api/v1/admin/feature-flags validates payload", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/feature-flags",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { key: "Invalid-Key!" }
  });

  assert.equal(res.statusCode, 400);
});

test("PUT /api/v1/admin/feature-flags/:key updates flag", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/feature-flags/dark_mode": {
      payload: { flag: { key: "dark_mode", enabled: true, rolloutPct: 50 } }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/feature-flags/dark_mode",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { enabled: true, rolloutPct: 50 }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/feature-flags/dark_mode") && c.method === "PUT"));
});

test("DELETE /api/v1/admin/feature-flags/:key deletes flag", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/feature-flags/old_flag": {
      payload: null,
      statusCode: 204
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "DELETE",
    url: "/api/v1/admin/feature-flags/old_flag",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 204);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/feature-flags/old_flag") && c.method === "DELETE"));
});

test("GET /api/v1/feature-flags proxies evaluated flags", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/feature-flags": {
      payload: { flags: { dark_mode: true, beta_search: false } }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/feature-flags",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { flags: Record<string, boolean> };
  assert.equal(body.flags.dark_mode, true);
  assert.equal(body.flags.beta_search, false);
  assert.ok(calls.some(c => c.url.includes("/internal/feature-flags")));
});

test("GET /api/v1/feature-flags works without auth", async (t) => {
  const { requestFn } = createMockRequestFn({
    "/internal/feature-flags": {
      payload: { flags: { public_flag: true } }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/feature-flags"
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { flags: Record<string, boolean> };
  assert.equal(body.flags.public_flag, true);
});
