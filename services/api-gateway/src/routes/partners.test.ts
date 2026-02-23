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

test("partner routes require admin and proxy organizer workflows", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_01"],
    partnerDashboardServiceBase: "http://partner-svc",
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
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
    headers: { "x-admin-user-id": "admin_01" },
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
  assert.equal(createCompetition.statusCode, 200);

  const submissions = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition_1/submissions",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(submissions.statusCode, 200);

  const assign = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/judges/assign",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { judgeUserId: "judge_1", submissionIds: ["submission_1"] }
  });
  assert.equal(assign.statusCode, 200);

  const evaluate = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/evaluations",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { submissionId: "submission_1", judgeUserId: "judge_1", score: 88 }
  });
  assert.equal(evaluate.statusCode, 200);

  const normalize = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/normalize",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { round: "default" }
  });
  assert.equal(normalize.statusCode, 200);

  const publish = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/publish-results",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { results: [{ submissionId: "submission_1", placementStatus: "winner" }] }
  });
  assert.equal(publish.statusCode, 200);

  const swap = await server.inject({
    method: "POST",
    url: "/api/v1/partners/competitions/competition_1/draft-swaps",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { submissionId: "submission_1", replacementScriptId: "script_2" }
  });
  assert.equal(swap.statusCode, 200);

  const analytics = await server.inject({
    method: "GET",
    url: "/api/v1/partners/competitions/competition_1/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(analytics.statusCode, 200);

  const sync = await server.inject({
    method: "POST",
    url: "/api/v1/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { competitionId: "competition_1", direction: "import" }
  });
  assert.equal(sync.statusCode, 200);

  assert.equal(urls[0], "http://partner-svc/internal/partners/competitions");
  assert.equal(urls[1], "http://partner-svc/internal/partners/competitions/competition_1/submissions");
  assert.equal(urls[2], "http://partner-svc/internal/partners/competitions/competition_1/judges/assign");
  assert.equal(urls[3], "http://partner-svc/internal/partners/competitions/competition_1/evaluations");
  assert.equal(urls[4], "http://partner-svc/internal/partners/competitions/competition_1/normalize");
  assert.equal(urls[5], "http://partner-svc/internal/partners/competitions/competition_1/publish-results");
  assert.equal(urls[6], "http://partner-svc/internal/partners/competitions/competition_1/draft-swaps");
  assert.equal(urls[7], "http://partner-svc/internal/partners/competitions/competition_1/analytics");
  assert.equal(urls[8], "http://partner-svc/internal/partners/integrations/filmfreeway/sync");
  assert.equal(headers[8]?.["x-admin-user-id"], "admin_01");
});
