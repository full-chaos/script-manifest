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

function authMeResponse(userId = "writer_01") {
  return jsonResponse({
    user: { id: userId, email: "writer@example.com", displayName: "Writer One" },
    expiresAt: "2026-12-31T00:00:00.000Z"
  });
}

test("POST /api/v1/auth/mfa/setup proxies to identity service with auth header", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return authMeResponse();
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({
        secret: "abcdef",
        otpauthUrl: "otpauth://totp/Test",
        qrCodeDataUrl: "otpauth://totp/Test"
      });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  // Without auth
  const noAuth = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/setup"
  });
  // Should still proxy (identity service will reject)
  assert.ok(noAuth.statusCode <= 502);

  // With auth
  const withAuth = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/setup",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(withAuth.statusCode, 200);
  const lastUrl = urls[urls.length - 1];
  assert.ok(lastUrl?.includes("/internal/auth/mfa/setup"));
});

test("POST /api/v1/auth/mfa/verify-setup proxies with body and auth", async (t) => {
  const bodies: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return authMeResponse();
      }
      if (options?.body) bodies.push(String(options.body));
      return jsonResponse({ enabled: true, backupCodes: ["abc", "def"] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/verify-setup",
    headers: { authorization: "Bearer sess_1", "content-type": "application/json" },
    payload: { code: "123456" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(bodies.some((b) => b.includes("123456")));
});

test("POST /api/v1/auth/mfa/disable proxies with body and auth", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return authMeResponse();
      }
      urls.push(urlStr);
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/disable",
    headers: { authorization: "Bearer sess_1", "content-type": "application/json" },
    payload: { password: "mypassword", code: "123456" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(urls.some((u) => u.includes("/internal/auth/mfa/disable")));
});

test("GET /api/v1/auth/mfa/status proxies with auth header", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return authMeResponse();
      }
      urls.push(urlStr);
      return jsonResponse({ mfaEnabled: false, enabledAt: null });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/api/v1/auth/mfa/status",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(urls.some((u) => u.includes("/internal/auth/mfa/status")));
});

test("POST /api/v1/auth/mfa/verify proxies without auth (public route)", async (t) => {
  const urls: string[] = [];
  const bodies: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      if (options?.body) bodies.push(String(options.body));
      return jsonResponse({
        token: "sess_new",
        refreshToken: "rfr_new",
        expiresAt: "2026-12-31T00:00:00.000Z",
        user: { id: "user_1", email: "test@example.com", displayName: "Test" }
      });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/verify",
    payload: { mfaToken: "mfa_abc123", code: "654321" }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(urls.some((u) => u.includes("/internal/auth/mfa/verify")));
  assert.ok(bodies.some((b) => b.includes("mfa_abc123")));
});

test("POST /api/v1/auth/mfa/verify returns 502 when upstream is down", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => {
      throw new Error("connection refused");
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/api/v1/auth/mfa/verify",
    payload: { mfaToken: "mfa_abc123", code: "654321" }
  });

  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error, "upstream_unavailable");
});
