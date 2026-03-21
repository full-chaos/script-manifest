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

test("competition routes proxy public list and deadline reminder endpoints", async (t) => {
  const urls: string[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      if (options?.body) {
        bodies.push(String(options.body));
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    competitionDirectoryBase: "http://competition-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/competitions?genre=Drama&format=Feature"
  });
  assert.equal(list.statusCode, 200);

  const reminders = await server.inject({
    method: "POST",
    url: "/api/v1/competitions/comp 1/deadline-reminders",
    headers: { "content-type": "application/json" },
    payload: { channel: "email" }
  });
  assert.equal(reminders.statusCode, 200);

  assert.equal(
    urls[0],
    "http://competition-svc/internal/competitions?genre=Drama&format=Feature"
  );
  assert.equal(
    urls[1],
    "http://competition-svc/internal/competitions/comp%201/deadline-reminders"
  );
  assert.equal(JSON.parse(bodies[0] ?? "{}").channel, "email");
});

test("admin competition routes enforce admin auth and validate payload", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "admin_01", role: "admin", email: "admin@example.com", displayName: "Admin" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    competitionDirectoryBase: "http://competition-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    headers: { "content-type": "application/json" },
    payload: {}
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const invalid = await server.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    headers: {
      authorization: "Bearer admin_token",
      "content-type": "application/json"
    },
    payload: { title: "missing required fields" }
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(urls.length, 0);

  const payload = {
    id: "comp_01",
    title: "Writers Cup",
    description: "Annual competition",
    format: "Feature",
    genre: "Drama",
    feeUsd: 50,
    deadline: "2026-10-10T00:00:00.000Z"
  };

  const create = await server.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    headers: {
      authorization: "Bearer admin_token",
      "content-type": "application/json"
    },
    payload
  });
  assert.equal(create.statusCode, 200);

  const update = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/competitions/comp 01",
    headers: {
      authorization: "Bearer admin_token",
      "content-type": "application/json"
    },
    payload
  });
  assert.equal(update.statusCode, 200);

  assert.equal(urls[0], "http://competition-svc/internal/admin/competitions");
  assert.equal(urls[1], "http://competition-svc/internal/admin/competitions/comp%2001");
  assert.equal(headers[0]?.["x-admin-user-id"], "admin_01");
  assert.equal(headers[1]?.["x-admin-user-id"], "admin_01");
});
