import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(
  payload: unknown,
  statusCode = 200,
  responseHeaders: Record<string, string> = { "content-type": "application/json" }
): RequestResult {
  return {
    statusCode,
    headers: responseHeaders,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      dump: async () => undefined
    }
  } as RequestResult;
}

test("auth routes set cookies from upstream session responses", async (t) => {
  const urls: string[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      if (options?.body) {
        bodies.push(String(options.body));
      }

      return jsonResponse({
        token: "sess_1",
        refreshToken: "refresh_1",
        expiresAt: "2026-12-31T00:00:00.000Z",
        user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" }
      });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const login = await server.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "content-type": "application/json" },
    payload: {
      email: "writer@example.com",
      password: "Password1!"
    }
  });
  assert.equal(login.statusCode, 200);
  assert.equal(urls[0], "http://identity-svc/internal/auth/login");
  assert.ok((login.headers["set-cookie"] ?? "").toString().includes("session_token=sess_1"));
  assert.ok((login.headers["set-cookie"] ?? "").toString().includes("refresh_token=refresh_1"));
  assert.equal(JSON.parse(bodies[0] ?? "{}").email, "writer@example.com");

  const refresh = await server.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: {
      cookie: "refresh_token=from_cookie",
      "content-type": "application/json"
    },
    payload: {}
  });
  assert.equal(refresh.statusCode, 200);
  assert.equal(urls[1], "http://identity-svc/internal/auth/refresh");
  assert.equal(JSON.parse(bodies[1] ?? "{}").refreshToken, "from_cookie");
});

test("auth refresh validates token source before proxying", async (t) => {
  const urls: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const missing = await server.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: { "content-type": "application/json" },
    payload: {}
  });

  assert.equal(missing.statusCode, 400);
  assert.equal(urls.length, 0);
});

test("auth logout and oauth callback proxy correctly", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const logout = await server.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { authorization: "Bearer sess_2" }
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(urls[0], "http://identity-svc/internal/auth/logout");
  assert.equal(headers[0]?.authorization, "Bearer sess_2");
  assert.ok((logout.headers["set-cookie"] ?? "").toString().includes("session_token="));

  const callback = await server.inject({
    method: "GET",
    url: "/api/v1/auth/oauth/google/callback?code=abc123&state=xyz"
  });
  assert.equal(callback.statusCode, 200);
  assert.equal(
    urls[1],
    "http://identity-svc/internal/auth/oauth/google/callback?code=abc123&state=xyz"
  );
});
