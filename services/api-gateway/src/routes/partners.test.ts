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

test("partner routes require authenticated actor and proxy organizer workflows", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url, options) => {
      const currentUrl = String(url);
      urls.push(currentUrl);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (currentUrl.endsWith("/competitions")) {
        return jsonResponse({ competition: { id: "competition_1" } }, 201);
      }
      if (currentUrl.endsWith("/messages")) {
        return jsonResponse({ message: { id: "message_1" } }, 201);
      }
      if (currentUrl.endsWith("/filmfreeway/sync")) {
        return jsonResponse({ job: { jobId: "job_1" } }, 202);
      }
      return jsonResponse({ ok: true }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions",
    payload: { title: "Spring Fellowship" }
  });
  assert.equal(forbidden.statusCode, 403);

  const createCompetition = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      organizerAccountId: "organizer_1",
      slug: "spring-fellowship-2026",
      title: "Spring Fellowship 2026",
      format: "feature",
      genre: "drama",
      submissionOpensAt: "2026-01-01T00:00:00.000Z",
      submissionClosesAt: "2026-03-01T00:00:00.000Z"
    }
  });
  assert.equal(createCompetition.statusCode, 201);

  const membership = await server.inject({
    method: "PUT",
    url: "/api/v1/partners/competitions/competition_1/memberships/judge_01",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { role: "editor" }
  });
  assert.equal(membership.statusCode, 200);

  const intake = await server.inject({
    method: "PUT",
    url: "/api/v1/partners/competitions/competition_1/intake",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      formFields: [{ key: "bio", label: "Bio", type: "textarea", required: true }],
      feeRules: { baseFeeCents: 5500, lateFeeCents: 1500 }
    }
  });
  assert.equal(intake.statusCode, 200);

  const submission = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/submissions",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      writerUserId: "writer_01",
      projectId: "project_01",
      scriptId: "script_01",
      formResponses: {}
    }
  });
  assert.equal(submission.statusCode, 200);

  const message = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/messages",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      messageKind: "broadcast",
      subject: "Update",
      body: "Round two starts next week"
    }
  });
  assert.equal(message.statusCode, 201);

  const sync = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { competitionId: "competition_1", direction: "import" }
  });
  assert.equal(sync.statusCode, 202);

  assert.deepEqual(urls, [
    "http://partner-svc/internal/partners/competitions",
    "http://partner-svc/internal/partners/competitions/competition_1/memberships/judge_01",
    "http://partner-svc/internal/partners/competitions/competition_1/intake",
    "http://partner-svc/internal/partners/competitions/competition_1/submissions",
    "http://partner-svc/internal/partners/competitions/competition_1/messages",
    "http://partner-svc/internal/partners/integrations/filmfreeway/sync"
  ]);
  assert.equal(headers[0]?.["x-admin-user-id"], "organizer_01");
  assert.equal(headers[0]?.["x-partner-user-id"], "organizer_01");
  assert.equal(headers[1]?.["x-admin-user-id"], "organizer_01");
  assert.equal(headers[2]?.["content-type"], "application/json");
});

test("partner routes support bearer-based actor resolution and query forwarding", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    identityServiceBase: "http://identity-svc",
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "organizer_02" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ messages: [] }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const messages = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition%201/messages?targetUserId=writer_1&limit=10",
    headers: { authorization: "Bearer organizer_token" }
  });
  assert.equal(messages.statusCode, 200);
  assert.equal(
    urls[0],
    "http://partner-svc/internal/partners/competitions/competition%201/messages?targetUserId=writer_1&limit=10"
  );
  assert.equal(headers[0]?.["x-admin-user-id"], "organizer_02");
});

test("partner routes proxy publish and sync lifecycle endpoints", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ ok: true }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const publish = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/publish-results",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { results: [{ submissionId: "submission_1", placementStatus: "winner" }] }
  });
  assert.equal(publish.statusCode, 200);

  const jobsRun = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/jobs/run",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { job: "normalization_recompute", round: "default" }
  });
  assert.equal(jobsRun.statusCode, 200);

  const claim = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/jobs/claim",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(claim.statusCode, 200);

  const complete = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/jobs/job_1/complete",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { detail: "synced" }
  });
  assert.equal(complete.statusCode, 200);

  const fail = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/jobs/job_1/fail",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { detail: "failed" }
  });
  assert.equal(fail.statusCode, 200);

  const runNext = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/run-next",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(runNext.statusCode, 200);

  assert.equal(urls[0], "http://partner-svc/internal/partners/competitions/competition_1/publish-results");
  assert.equal(urls[1], "http://partner-svc/internal/partners/competitions/competition_1/jobs/run");
  assert.equal(urls[2], "http://partner-svc/internal/partners/integrations/filmfreeway/sync/jobs/claim");
  assert.equal(urls[3], "http://partner-svc/internal/partners/integrations/filmfreeway/sync/jobs/job_1/complete");
  assert.equal(urls[4], "http://partner-svc/internal/partners/integrations/filmfreeway/sync/jobs/job_1/fail");
  assert.equal(urls[5], "http://partner-svc/internal/partners/integrations/filmfreeway/sync/run-next");
});

test("partner routes proxy submissions, judging, evaluation, normalize, draft swap, and analytics endpoints", async (t) => {
  const urls: string[] = [];
  const methods: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url, options) => {
      urls.push(String(url));
      methods.push(String(options?.method ?? "GET"));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true }, 200);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const submissions = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition_1/submissions",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(submissions.statusCode, 200);

  const autoAssign = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/judges/auto-assign",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      judgeUserIds: ["judge_01", "judge_02"],
      maxAssignmentsPerJudge: 2
    }
  });
  assert.equal(autoAssign.statusCode, 200);

  const assign = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/judges/assign",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      judgeUserId: "judge_01",
      submissionIds: ["submission_1"]
    }
  });
  assert.equal(assign.statusCode, 200);

  const evaluations = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/evaluations",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      submissionId: "submission_1",
      judgeUserId: "judge_01",
      score: 88
    }
  });
  assert.equal(evaluations.statusCode, 200);

  const normalize = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/normalize",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: { round: "default" }
  });
  assert.equal(normalize.statusCode, 200);

  const swap = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/draft-swaps",
    headers: { "x-auth-user-id": "organizer_01" },
    payload: {
      submissionId: "submission_1",
      replacementScriptId: "script_02"
    }
  });
  assert.equal(swap.statusCode, 200);

  const analytics = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition_1/analytics",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(analytics.statusCode, 200);

  assert.deepEqual(urls, [
    "http://partner-svc/internal/partners/competitions/competition_1/submissions",
    "http://partner-svc/internal/partners/competitions/competition_1/judges/auto-assign",
    "http://partner-svc/internal/partners/competitions/competition_1/judges/assign",
    "http://partner-svc/internal/partners/competitions/competition_1/evaluations",
    "http://partner-svc/internal/partners/competitions/competition_1/normalize",
    "http://partner-svc/internal/partners/competitions/competition_1/draft-swaps",
    "http://partner-svc/internal/partners/competitions/competition_1/analytics"
  ]);
  assert.deepEqual(methods, ["GET", "POST", "POST", "POST", "POST", "POST", "GET"]);
  assert.equal(headers[0]?.["x-admin-user-id"], "organizer_01");
  assert.equal(headers[1]?.["content-type"], "application/json");
  assert.equal(headers[2]?.["content-type"], "application/json");
  assert.equal(headers[3]?.["content-type"], "application/json");
  assert.equal(headers[4]?.["content-type"], "application/json");
  assert.equal(headers[5]?.["content-type"], "application/json");
  assert.equal(headers[6]?.["x-partner-user-id"], "organizer_01");
});

test("partner routes preserve upstream partner error statuses and payloads", async (t) => {
  const server = buildServer({
    logger: false,
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/messages")) {
        return jsonResponse({ error: "competition_not_found" }, 404);
      }
      if (urlStr.endsWith("/sync/jobs/claim")) {
        return jsonResponse({ error: "job_not_found" }, 404);
      }
      if (urlStr.endsWith("/sync/run-next")) {
        return jsonResponse({ error: "sync_runner_not_configured" }, 501);
      }
      return jsonResponse({ error: "unexpected_url" }, 500);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const messages = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition_404/messages",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(messages.statusCode, 404);
  assert.equal(messages.json().error, "competition_not_found");

  const claim = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/jobs/claim",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(claim.statusCode, 404);
  assert.equal(claim.json().error, "job_not_found");

  const runNext = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync/run-next",
    headers: { "x-auth-user-id": "organizer_01" }
  });
  assert.equal(runNext.statusCode, 501);
  assert.equal(runNext.json().error, "sync_runner_not_configured");
});
