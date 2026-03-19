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

test("GET /api/v1/admin/search/status proxies to search indexer", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/search/status": {
      payload: { clusterHealth: "green", indexName: "competitions_v1", documentCount: 100, indexSizeBytes: 5000, lastSyncAt: null }
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
  const body = JSON.parse(res.payload) as { clusterHealth: string; documentCount: number };
  assert.equal(body.clusterHealth, "green");
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

test("POST /api/v1/admin/search/reindex proxies to search indexer", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/search/reindex": {
      payload: { jobId: "reindex_123", type: "all", status: "started", startedAt: "2026-03-08T00:00:00.000Z" },
      statusCode: 202
    }
  });

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

  assert.equal(res.statusCode, 202);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/search/reindex") && c.method === "POST"));
});

test("POST /api/v1/admin/search/reindex/:type proxies to search indexer", async (t) => {
  const { requestFn, calls } = createMockRequestFn({
    "/internal/admin/search/reindex/competitions": {
      payload: { jobId: "reindex_456", type: "competitions", status: "started", startedAt: "2026-03-08T00:00:00.000Z" },
      statusCode: 202
    }
  });

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

  assert.equal(res.statusCode, 202);
  assert.ok(calls.some(c => c.url.includes("/internal/admin/search/reindex/competitions")));
});
