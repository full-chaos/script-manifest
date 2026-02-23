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
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

test("GET /api/v1/leaderboard proxies query params to ranking service", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ entries: [], total: 0 });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/leaderboard?genre=Drama&limit=10"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/leaderboard?genre=Drama&limit=10");
});

test("GET /api/v1/rankings/writers/:writerId proxies to writer score endpoint", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ writerId: "writer_01", score: 9500 });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/rankings/writers/writer_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/writers/writer_01/score");
});

test("GET /api/v1/rankings/writers/:writerId/badges proxies to writer badges endpoint", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ writerId: "writer_01", badges: ["finalist"] });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/rankings/writers/writer_01/badges"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/writers/writer_01/badges");
});

test("GET /api/v1/rankings/methodology proxies to methodology endpoint", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ description: "Ranking algorithm details" });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/rankings/methodology"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/methodology");
});

test("POST /api/v1/rankings/appeals requires auth and proxies with user id", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ appeal: { id: "appeal_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  // Unauthenticated — should be rejected
  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/rankings/appeals",
    payload: { reason: "I deserve a higher score" }
  });
  assert.equal(forbidden.statusCode, 401);
  assert.equal(urls.length, 0);

  // Authenticated — should proxy
  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/rankings/appeals",
    headers: { authorization: "Bearer sess_1" },
    payload: { reason: "I deserve a higher score" }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://ranking-svc/internal/appeals");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/admin/rankings/prestige requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ prestige: [] });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/prestige"
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/prestige",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/prestige");
});

test("PUT /api/v1/admin/rankings/prestige/:competitionId requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/rankings/prestige/comp_01",
    payload: { multiplier: 2 }
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/rankings/prestige/comp_01",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { multiplier: 2 }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/prestige/comp_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("POST /api/v1/admin/rankings/recompute requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/recompute"
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/recompute",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/recompute");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("GET /api/v1/admin/rankings/appeals requires admin and forwards query params", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ appeals: [] });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/appeals?status=pending"
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/appeals?status=pending",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/appeals?status=pending");
});

test("POST /api/v1/admin/rankings/appeals/:appealId/resolve requires admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ appeal: { id: "appeal_01", status: "resolved" } });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/appeals/appeal_01/resolve",
    payload: { status: "accepted", notes: "Valid appeal" }
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/appeals/appeal_01/resolve",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", notes: "Valid appeal" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/appeals/appeal_01/resolve");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("GET /api/v1/admin/rankings/flags requires admin and proxies query params", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ flags: [] });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/flags?type=self-vote"
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/admin/rankings/flags?type=self-vote",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/flags?type=self-vote");
});

test("POST /api/v1/admin/rankings/flags/:flagId/resolve requires admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ flag: { id: "flag_01", status: "resolved" } });
    }) as typeof request,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/flags/flag_01/resolve",
    payload: { action: "dismiss" }
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/admin/rankings/flags/flag_01/resolve",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { action: "dismiss" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://ranking-svc/internal/flags/flag_01/resolve");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});
