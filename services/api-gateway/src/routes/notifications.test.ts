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

test("notifications routes require auth and proxy user-scoped endpoints", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (options?.body) {
        bodies.push(String(options.body));
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    notificationServiceBase: "http://notification-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const unauthorized = await server.inject({
    method: "GET",
    url: "/api/v1/notifications"
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(urls.length, 0);

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/notifications?status=unread&limit=5",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(list.statusCode, 200);

  const unreadCount = await server.inject({
    method: "GET",
    url: "/api/v1/notifications/unread-count",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(unreadCount.statusCode, 200);

  const markRead = await server.inject({
    method: "PATCH",
    url: "/api/v1/notifications/event 1/read",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(markRead.statusCode, 200);

  assert.equal(
    urls[0],
    "http://notification-svc/internal/events/writer_01?status=unread&limit=5"
  );
  assert.equal(urls[1], "http://notification-svc/internal/events/writer_01/unread-count");
  assert.equal(urls[2], "http://notification-svc/internal/events/event%201/read");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[1]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[2]?.["x-auth-user-id"], "writer_01");
  assert.equal(JSON.parse(bodies[0] ?? "{}").targetUserId, "writer_01");
});
