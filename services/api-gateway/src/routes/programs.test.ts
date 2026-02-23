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

test("programs routes proxy application flow with auth context", async (t) => {
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
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    programsServiceBase: "http://programs-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const apply = await server.inject({
    method: "POST",
    url: "/api/v1/programs/program_1/applications",
    headers: { authorization: "Bearer sess_1" },
    payload: { statement: "My application." }
  });
  assert.equal(apply.statusCode, 200);
  assert.equal(urls[0], "http://programs-svc/internal/programs/program_1/applications");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");

  const mine = await server.inject({
    method: "GET",
    url: "/api/v1/programs/program_1/applications/me",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(urls[1], "http://programs-svc/internal/programs/program_1/applications/me");
});

test("admin program review route requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    industryAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    programsServiceBase: "http://programs-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/applications/app_1/review",
    payload: { status: "accepted" }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const allowed = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/applications/app_1/review",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", score: 90 }
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(
    urls[0],
    "http://programs-svc/internal/admin/programs/program_1/applications/app_1/review"
  );
  assert.equal(headers[0]?.["x-admin-user-id"], "admin_01");
});
