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

test("admin programs routes enforce allowlist and proxy lifecycle endpoints", async (t) => {
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
    url: "/api/v1/admin/programs/program_1/cohorts",
    payload: { name: "Cohort A" }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const review = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/applications/app_1/review",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", score: 90 }
  });
  assert.equal(review.statusCode, 200);

  const cohortCreate = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/cohorts",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      name: "Cohort A",
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-08-01T00:00:00.000Z"
    }
  });
  assert.equal(cohortCreate.statusCode, 200);

  const sessionCreate = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/sessions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      title: "Live Workshop",
      startsAt: "2026-06-15T17:00:00.000Z",
      endsAt: "2026-06-15T18:00:00.000Z"
    }
  });
  assert.equal(sessionCreate.statusCode, 200);

  const attendance = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/sessions/session_1/attendance",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { userId: "writer_01", status: "attended" }
  });
  assert.equal(attendance.statusCode, 200);

  const mentorship = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/mentorship/matches",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { matches: [{ mentorUserId: "mentor_01", menteeUserId: "writer_01" }] }
  });
  assert.equal(mentorship.statusCode, 200);

  const analytics = await server.inject({
    method: "GET",
    url: "/api/v1/admin/programs/program_1/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(analytics.statusCode, 200);

  assert.equal(
    urls[0],
    "http://programs-svc/internal/admin/programs/program_1/applications/app_1/review"
  );
  assert.equal(urls[1], "http://programs-svc/internal/admin/programs/program_1/cohorts");
  assert.equal(urls[2], "http://programs-svc/internal/admin/programs/program_1/sessions");
  assert.equal(
    urls[3],
    "http://programs-svc/internal/admin/programs/program_1/sessions/session_1/attendance"
  );
  assert.equal(
    urls[4],
    "http://programs-svc/internal/admin/programs/program_1/mentorship/matches"
  );
  assert.equal(urls[5], "http://programs-svc/internal/admin/programs/program_1/analytics");
  assert.equal(headers[5]?.["x-admin-user-id"], "admin_01");
});
