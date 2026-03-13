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

test("GET /api/v1/profiles/:writerId proxies to profile service with optional auth header", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
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
      return jsonResponse({ profile: { writerId: "writer_01", displayName: "Writer One" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  // Authenticated request — x-auth-user-id should be forwarded
  const authed = await server.inject({
    method: "GET",
    url: "/api/v1/profiles/writer_01",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(authed.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/profiles/writer_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/profiles/:writerId proxies without auth header when unauthenticated", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ profile: { writerId: "writer_02" } });
    }) as typeof request,
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  // Unauthenticated request — no x-auth-user-id header should be added
  const unauthed = await server.inject({
    method: "GET",
    url: "/api/v1/profiles/writer_02"
  });
  assert.equal(unauthed.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/profiles/writer_02");
  assert.equal(headers[0]?.["x-auth-user-id"], undefined);
});

test("PUT /api/v1/profiles/:writerId proxies to profile service with auth header and body", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
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
      return jsonResponse({ profile: { writerId: "writer_01", displayName: "Updated Name" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PUT",
    url: "/api/v1/profiles/writer_01",
    headers: { authorization: "Bearer sess_1" },
    payload: { displayName: "Updated Name", bio: "New bio" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/profiles/writer_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[0]?.["content-type"], "application/json");
});

test("PUT /api/v1/profiles/:writerId returns 403 when auth user does not own the profile", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        // Auth returns user_B, but request targets user_A's profile
        return jsonResponse({
          user: { id: "user_B", email: "b@example.com", displayName: "User B" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      return jsonResponse({});
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PUT",
    url: "/api/v1/profiles/user_A",
    headers: { authorization: "Bearer sess_B" },
    payload: { displayName: "Hacked Name" }
  });

  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.payload) as { error: string };
  assert.equal(body.error, "forbidden");
});

test("PUT /api/v1/profiles/:writerId returns 403 when no auth is provided", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => {
      // Should never be called for the profile service — auth check must fail first
      return jsonResponse({});
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PUT",
    url: "/api/v1/profiles/writer_01",
    payload: { displayName: "No Auth Name" }
  });

  // userId is null (no auth), writerId is writer_01 → null !== writer_01 → 403
  assert.equal(response.statusCode, 403);
  const body = JSON.parse(response.payload) as { error: string };
  assert.equal(body.error, "forbidden");
});

test("GET /api/v1/profiles/:writerId URL-encodes writerId with special characters", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ profile: { writerId: "writer 99" } });
    }) as typeof request,
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/profiles/writer%2099"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/profiles/writer%2099");
});
