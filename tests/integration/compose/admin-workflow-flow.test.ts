import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, makeUnique, registerUser } from "./helpers.js";

const ADMIN_USER_ID = "admin_01";

test("compose flow: admin operations enforce allowlist across coverage competition and industry", async () => {
  const nonAdmin = await registerUser("admin-flow-non-admin");

  const coverageDenied = await jsonRequest<{ error?: string }>(
    `${API_BASE_URL}/api/v1/coverage/admin/providers/review-queue`,
    {
      method: "GET",
      headers: authHeaders(nonAdmin.token)
    }
  );
  assert.ok([401, 403].includes(coverageDenied.status));

  await expectOkJson<{ queue?: unknown[] }>(
    `${API_BASE_URL}/api/v1/coverage/admin/providers/review-queue`,
    {
      method: "GET",
      headers: { "x-admin-user-id": ADMIN_USER_ID }
    },
    200
  );

  const competitionPayload = {
    id: makeUnique("competition_admin_flow"),
    title: "Integration Competition",
    description: "Competition created in integration admin flow.",
    format: "feature",
    genre: "drama",
    feeUsd: 35,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  const competitionDenied = await jsonRequest<{ error?: string }>(
    `${API_BASE_URL}/api/v1/admin/competitions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(nonAdmin.token)
      },
      body: JSON.stringify(competitionPayload)
    }
  );
  assert.ok([401, 403].includes(competitionDenied.status));

  const competitionCreated = await expectOkJson<{ competition: { id: string; title: string } }>(
    `${API_BASE_URL}/api/v1/admin/competitions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": ADMIN_USER_ID
      },
      body: JSON.stringify(competitionPayload)
    },
    201
  );
  assert.equal(competitionCreated.competition.id, competitionPayload.id);

  const updatedCompetition = await expectOkJson<{ competition: { id: string; title: string } }>(
    `${API_BASE_URL}/api/v1/admin/competitions/${encodeURIComponent(competitionPayload.id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": ADMIN_USER_ID
      },
      body: JSON.stringify({
        ...competitionPayload,
        title: "Integration Competition Updated"
      })
    },
    200
  );
  assert.equal(updatedCompetition.competition.id, competitionPayload.id);

  const mandatePayload = {
    type: "mandate",
    title: `Integration Industry Mandate ${makeUnique("mandate")}`,
    description: "Mandate created in admin workflow integration test.",
    format: "feature",
    genre: "drama",
    opensAt: new Date(Date.now() - 60 * 1000).toISOString(),
    closesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  };

  const industryDenied = await jsonRequest<{ error?: string }>(`${API_BASE_URL}/api/v1/industry/mandates`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(nonAdmin.token)
    },
    body: JSON.stringify(mandatePayload)
  });
  assert.ok([401, 403].includes(industryDenied.status));

  const createdMandate = await expectOkJson<{ mandate: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/industry/mandates`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": ADMIN_USER_ID
      },
      body: JSON.stringify(mandatePayload)
    },
    201
  );
  assert.ok(createdMandate.mandate.id.length > 0);

  const mandateSubmissions = await expectOkJson<{ submissions: Array<{ id: string }> }>(
    `${API_BASE_URL}/api/v1/industry/mandates/${encodeURIComponent(createdMandate.mandate.id)}/submissions`,
    {
      method: "GET",
      headers: { "x-admin-user-id": ADMIN_USER_ID }
    },
    200
  );
  assert.ok(Array.isArray(mandateSubmissions.submissions));
});
