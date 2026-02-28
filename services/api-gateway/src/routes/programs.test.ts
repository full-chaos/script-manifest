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

test("programs routes proxy application-form lookups", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({
        form: {
          fields: [{ key: "goals", label: "Goals", type: "textarea", required: true }]
        }
      });
    }) as typeof request,
    programsServiceBase: "http://programs-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const form = await server.inject({
    method: "GET",
    url: "/api/v1/programs/program form/application-form"
  });
  assert.equal(form.statusCode, 200);
  assert.equal(
    urls[0],
    "http://programs-svc/internal/programs/program%20form/application-form"
  );
  assert.equal(form.json().form.fields.length, 1);
  assert.equal(form.json().form.fields[0]?.key, "goals");
});

test("admin programs routes enforce allowlist and proxy lifecycle endpoints", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
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

test("programs routes reject requests when user auth cannot be resolved", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      urls.push(urlStr);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
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
    headers: { authorization: "Bearer sess_bad" },
    payload: { statement: "Hello" }
  });
  assert.equal(apply.statusCode, 401);

  assert.equal(urls.length, 1);
  assert.equal(urls[0], "http://identity-svc/internal/auth/me");
});

test("programs routes proxy query filters and support bearer-based admin resolution", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
    logger: false,
    industryAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "admin_01" },
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

  const programs = await server.inject({
    method: "GET",
    url: "/api/v1/programs?status=open"
  });
  assert.equal(programs.statusCode, 200);
  assert.equal(urls[0], "http://programs-svc/internal/programs?status=open");

  const adminApps = await server.inject({
    method: "GET",
    url: "/api/v1/admin/programs/program%201/applications",
    headers: { authorization: "Bearer admin_token" }
  });
  assert.equal(adminApps.statusCode, 200);
  assert.equal(
    urls[1],
    "http://programs-svc/internal/admin/programs/program%201/applications"
  );
  assert.equal(headers[1]?.["x-admin-user-id"], "admin_01");
});

test("programs routes proxy advanced phase-6 admin workflows", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = await buildServer({
    logger: false,
    industryAdminAllowlist: ["admin_01"],
    programsServiceBase: "http://programs-svc",
    requestFn: (async (url, options) => {
      const currentUrl = String(url);
      urls.push(currentUrl);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (currentUrl.endsWith("/outcomes")) {
        return jsonResponse({ ok: true }, 201);
      }
      if (currentUrl.includes("/crm-sync") && options?.method === "POST") {
        return jsonResponse({ ok: true, job: { id: "crm_1" } }, 202);
      }
      return jsonResponse({ ok: true, jobs: [{ id: "crm_1" }] }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const form = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/programs/program_1/application-form",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { fields: [{ key: "goals", label: "Goals", type: "textarea", required: true }] }
  });
  assert.equal(form.statusCode, 200);

  const rubric = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/programs/program_1/scoring-rubric",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { criteria: [{ key: "voice", label: "Voice", weight: 1, maxScore: 100 }] }
  });
  assert.equal(rubric.statusCode, 200);

  const availability = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/availability",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { windows: [] }
  });
  assert.equal(availability.statusCode, 200);

  const match = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/scheduling/match",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { attendeeUserIds: ["writer_01"], durationMinutes: 30 }
  });
  assert.equal(match.statusCode, 200);

  const integration = await server.inject({
    method: "PATCH",
    url: "/api/v1/admin/programs/program_1/sessions/session_1/integration",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { provider: "zoom" }
  });
  assert.equal(integration.statusCode, 200);

  const reminders = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/sessions/session_1/reminders/dispatch",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(reminders.statusCode, 200);

  const outcome = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/outcomes",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { userId: "writer_01", outcomeType: "staffed" }
  });
  assert.equal(outcome.statusCode, 201);

  const crmPost = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { reason: "weekly" }
  });
  assert.equal(crmPost.statusCode, 202);

  const crmGet = await server.inject({
    method: "GET",
    url: "/api/v1/admin/programs/program_1/crm-sync?status=failed&limit=10&offset=5",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(crmGet.statusCode, 200);

  const runJobs = await server.inject({
    method: "POST",
    url: "/api/v1/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "crm_sync_dispatcher", limit: 5 }
  });
  assert.equal(runJobs.statusCode, 200);

  assert.equal(urls[0], "http://programs-svc/internal/admin/programs/program_1/application-form");
  assert.equal(urls[1], "http://programs-svc/internal/admin/programs/program_1/scoring-rubric");
  assert.equal(urls[2], "http://programs-svc/internal/admin/programs/program_1/availability");
  assert.equal(urls[3], "http://programs-svc/internal/admin/programs/program_1/scheduling/match");
  assert.equal(
    urls[4],
    "http://programs-svc/internal/admin/programs/program_1/sessions/session_1/integration"
  );
  assert.equal(
    urls[5],
    "http://programs-svc/internal/admin/programs/program_1/sessions/session_1/reminders/dispatch"
  );
  assert.equal(urls[6], "http://programs-svc/internal/admin/programs/program_1/outcomes");
  assert.equal(urls[7], "http://programs-svc/internal/admin/programs/program_1/crm-sync");
  assert.equal(
    urls[8],
    "http://programs-svc/internal/admin/programs/program_1/crm-sync?status=failed&limit=10&offset=5"
  );
  assert.equal(urls[9], "http://programs-svc/internal/admin/programs/jobs/run");
  assert.equal(headers[9]?.["x-admin-user-id"], "admin_01");
});
