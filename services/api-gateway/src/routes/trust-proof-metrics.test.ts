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

const publicPayload = {
  metrics: {
    snapshotAt: "2026-05-24T12:00:00.000Z",
    scriptsHostedTotal: 1,
    placementsRecordedTotal: 2,
    placementsVerifiedTotal: 1,
    competitionsTrackedTotal: 3,
    exportsGeneratedTotal: 4,
    verifiedIndustryDownloadsTotal: 5,
    writersExportablePct: 100
  }
};

test("GET /api/v1/trust-proof-metrics proxies public metrics without auth", async (t) => {
  const calls: string[] = [];
  const server = await buildServer({
    logger: false,
    metricsServiceBase: "http://metrics-svc",
    requestFn: (async (url: string | URL) => {
      calls.push(String(url));
      return jsonResponse(publicPayload);
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({ method: "GET", url: "/api/v1/trust-proof-metrics" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "public, max-age=300, stale-while-revalidate=900");
  assert.deepEqual(res.json(), publicPayload);
  assert.ok(calls.some((url) => url === "http://metrics-svc/internal/trust-proof-metrics/public"));
});

test("GET /api/v1/admin/trust-proof-metrics requires admin role and proxies", async (t) => {
  const calls: Array<{ url: string; role?: string }> = [];
  const adminPayload = {
    ...publicPayload,
    refresh: { refreshedAt: "2026-05-24T12:01:00.000Z", cacheTtlSeconds: 60, warnings: [] }
  };
  const server = await buildServer({
    logger: false,
    metricsServiceBase: "http://metrics-svc",
    requestFn: (async (url: string | URL, options?: { headers?: Record<string, string> }) => {
      if (String(url).includes("/internal/auth/me")) {
        return jsonResponse({ user: { id: "admin_1", role: "admin" } });
      }
      calls.push({ url: String(url), role: options?.headers?.["x-auth-user-role"] });
      return jsonResponse(adminPayload);
    }) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/admin/trust-proof-metrics",
    headers: { authorization: "Bearer admin" }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "private, max-age=60, stale-while-revalidate=240");
  assert.equal(calls[0]?.url, "http://metrics-svc/internal/admin/trust-proof-metrics");
  assert.equal(calls[0]?.role, "admin");
});

test("POST /api/v1/admin/trust-proof-metrics/refresh rejects non-admin", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => jsonResponse({ user: { id: "writer_1", role: "writer" } })) as typeof request
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/admin/trust-proof-metrics/refresh",
    headers: { authorization: "Bearer writer" }
  });

  assert.equal(res.statusCode, 403);
});
