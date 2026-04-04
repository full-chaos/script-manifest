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

    if (String(url).includes("/internal/auth/me")) {
      return jsonResponse({ user: { id: ADMIN_USER_ID, email: "admin@test.com", displayName: "Admin", role: authRole } });
    }

    for (const [pattern, response] of Object.entries(responses)) {
      if (String(url).includes(pattern)) {
        return jsonResponse(response.payload, response.statusCode ?? 200);
      }
    }

    return jsonResponse({ error: "not_found" }, 404);
  }) as typeof request;

  return { requestFn, calls };
}

test("GET /api/v1/admin/search/status proxies to competition-directory-service", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/search/status": {
      payload: {
        backend: "postgres_fts",
        searchHealth: "ready",
        documentCount: 100,
        indexSizeBytes: 5000,
        lastSyncAt: null,
        notes: []
      }
    }
  });

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/search/status",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { backend: string; searchHealth: string; documentCount: number };
  assert.equal(body.backend, "postgres_fts");
  assert.equal(body.searchHealth, "ready");
  assert.equal(body.documentCount, 100);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/search/status")));
});

test("GET /api/v1/admin/search/status returns 403 without admin", async (t) => {
  const { requestFn } = createMockRequestFn({}, "writer");

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/search/status",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 403);
});

test("POST /api/v1/admin/search/reindex returns static not-applicable response", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/search/reindex",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { message: string; type: string; status: string };
  assert.equal(body.status, "not_applicable");
  assert.equal(body.type, "all");
  assert.ok(body.message.includes("PostgreSQL FTS"));
});

test("POST /api/v1/admin/search/reindex/:type returns static not-applicable response", async (t) => {
  const { requestFn } = createMockRequestFn({});

  const server = await buildServer({
    logger: false,
    requestFn
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/search/reindex/competitions",
    headers: { authorization: "Bearer test-token" }
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.payload) as { message: string; type: string; status: string };
  assert.equal(body.status, "not_applicable");
  assert.equal(body.type, "competitions");
});
