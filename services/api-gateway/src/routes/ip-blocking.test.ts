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
  const calls: { url: string; method: string }[] = [];

  const requestFn = (async (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(url), method: options?.method ?? "GET" });

    // Auth endpoint — return admin user
    if (String(url).includes("/internal/auth/me")) {
      return jsonResponse({ user: { id: ADMIN_USER_ID, email: "admin@test.com", displayName: "Admin", role: authRole } });
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

test("GET /api/v1/admin/ip-blocks proxies to identity service", async (t) => {
  const { requestFn } = createMockRequestFn({
    "/internal/admin/ip-blocks": {
      payload: { blocks: [], total: 0, page: 1, limit: 50 }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/ip-blocks?page=1&limit=50",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { blocks: unknown[]; total: number };
  assert.equal(body.total, 0);
});

test("GET /api/v1/admin/ip-blocks returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({}, "writer");

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/ip-blocks",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /api/v1/admin/ip-blocks proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/ip-blocks": {
      payload: { block: { id: "ipb_1", ipAddress: "192.168.1.1", reason: "Abuse" } },
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
    url: "/api/v1/admin/ip-blocks",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { ipAddress: "192.168.1.1", reason: "Abuse" }
  });

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/ip-blocks") && c.method === "POST"));
});

test("POST /api/v1/admin/ip-blocks validates request body", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/ip-blocks",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { ipAddress: "", reason: "test" }
  });

  assert.equal(res.statusCode, 400);
});

test("POST /api/v1/admin/ip-blocks returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({}, "writer");

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/ip-blocks",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-token"
    },
    payload: { ipAddress: "192.168.1.1", reason: "test" }
  });

  assert.equal(res.statusCode, 403);
});

test("DELETE /api/v1/admin/ip-blocks/:id proxies to identity service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/ip-blocks/ipb_1": {
      payload: { ok: true }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "DELETE",
    url: "/api/v1/admin/ip-blocks/ipb_1",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(calls.some((c) => c.url.includes("/internal/admin/ip-blocks/ipb_1") && c.method === "DELETE"));
});

test("DELETE /api/v1/admin/ip-blocks/:id returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({}, "writer");

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "DELETE",
    url: "/api/v1/admin/ip-blocks/ipb_1",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});
