import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE_URL,
  COMPETITION_SERVICE_BASE_URL,
  RANKING_SERVICE_BASE_URL,
  authHeaders,
  expectOkJson,
  jsonRequest,
  makeUnique,
  registerUser
} from "./helpers.js";

test("compose flow: submission placement drives ranking recompute", async () => {
  const session = await registerUser("ranking-writer");
  const competitionId = makeUnique("comp");

  const projectResponse = await expectOkJson<{ project: { id: string } }>(
    `${API_BASE_URL}/api/v1/projects`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({
        title: "Integration Ranking Script",
        logline: "A writer validates ranking integration.",
        synopsis: "Flow test for submission and ranking recompute.",
        format: "feature",
        genre: "drama",
        pageCount: 110,
        isDiscoverable: true
      })
    },
    201
  );
  const projectId = projectResponse.project.id;
  assert.ok(projectId.length > 0);

  await expectOkJson(
    `${COMPETITION_SERVICE_BASE_URL}/internal/competitions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: competitionId,
        title: "Integration Ranking Competition",
        description: "Used by compose integration tests.",
        format: "feature",
        genre: "drama",
        feeUsd: 10,
        deadline: "2026-12-01T00:00:00.000Z"
      })
    },
    201
  );

  const submissionResponse = await expectOkJson<{ submission: { id: string } }>(
    `${API_BASE_URL}/api/v1/submissions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({
        projectId,
        competitionId,
        status: "pending"
      })
    },
    201
  );
  const submissionId = submissionResponse.submission.id;

  const placementResponse = await expectOkJson<{ placement: { id: string } }>(
    `${API_BASE_URL}/api/v1/submissions/${encodeURIComponent(submissionId)}/placements`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({ status: "semifinalist" })
    },
    201
  );
  const placementId = placementResponse.placement.id;

  await expectOkJson(
    `${API_BASE_URL}/api/v1/placements/${encodeURIComponent(placementId)}/verify`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(session.token)
      },
      body: JSON.stringify({ verificationState: "verified" })
    },
    200
  );

  await expectOkJson(
    `${RANKING_SERVICE_BASE_URL}/internal/recompute`,
    {
      method: "POST",
      headers: { "content-type": "application/json" }
    },
    200
  );

  const leaderboard = await expectOkJson<{
    leaderboard: Array<{ writerId: string; totalScore: number }>;
  }>(`${API_BASE_URL}/api/v1/leaderboard`, { method: "GET" }, 200);
  const writerRow = leaderboard.leaderboard.find((entry) => entry.writerId === session.user.id);
  assert.ok(writerRow, "expected writer to appear on leaderboard");
  assert.ok((writerRow?.totalScore ?? 0) > 0);

  const writerScore = await jsonRequest<{
    writerId: string;
    placementCount: number;
    totalScore: number;
  }>(`${API_BASE_URL}/api/v1/rankings/writers/${encodeURIComponent(session.user.id)}`, {
    method: "GET"
  });
  assert.equal(writerScore.status, 200, writerScore.rawBody);
  assert.equal(writerScore.body.writerId, session.user.id);
  assert.ok(writerScore.body.placementCount >= 1);
  assert.ok(writerScore.body.totalScore > 0);
});
