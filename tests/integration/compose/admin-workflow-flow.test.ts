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

  // Industry mandate creation: verify allowlist enforcement.
  // Note: admin_01 is a synthetic ID in the INDUSTRY_ADMIN_ALLOWLIST but is NOT a real
  // database user, so the industry-portal-service returns 404 ("admin_user_not_found")
  // after the gateway allowlist check passes. We verify both the deny path (non-admin)
  // and the pass-through behavior (admin_01 reaches the downstream service).

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
  assert.ok([401, 403].includes(industryDenied.status),
    `expected 401 or 403 for non-admin industry mandate creation, got ${industryDenied.status}`
  );

  // Admin allowlist check passes at gateway but downstream service rejects because
  // admin_01 is not a real registered user. A 404 (not 401/403) proves the gateway
  // allowlist DID authorize the request -- the rejection comes from the service layer.
  const industryAdminResponse = await jsonRequest<{ error?: string }>(
    `${API_BASE_URL}/api/v1/industry/mandates`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": ADMIN_USER_ID
      },
      body: JSON.stringify(mandatePayload)
    }
  );
  assert.equal(industryAdminResponse.status, 404,
    `expected 404 (admin_user_not_found) from industry service, got ${industryAdminResponse.status}: ${industryAdminResponse.rawBody}`
  );
  assert.equal(industryAdminResponse.body.error, "admin_user_not_found");
});
