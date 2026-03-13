import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, loginUser, makeUnique, registerUser } from "./helpers.js";

const ADMIN_USER_ID = "admin_01";
const ADMIN_EMAIL = "admin_01_harness@example.com";
const ADMIN_PASSWORD = "AdminPass1!";

const db = getPool(process.env.INTEGRATION_DATABASE_URL ?? "postgresql://manifest:manifest@localhost:5432/manifest");

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}

async function ensureAdminUser(): Promise<string> {
  const salt = "harness_admin_salt_01";
  const hash = hashPassword(ADMIN_PASSWORD, salt);
  await db.query(
    `INSERT INTO app_users (id, email, password_hash, password_salt, display_name, role, created_at, terms_accepted_at)
     VALUES ($1,$2,$3,$4,'Integration Admin','admin',NOW(),NOW())
     ON CONFLICT (id)
     DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
                   password_salt = EXCLUDED.password_salt, role = EXCLUDED.role`,
    [ADMIN_USER_ID, ADMIN_EMAIL, hash, salt]
  );
  const session = await loginUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  return session.token;
}

test("compose flow: admin operations enforce allowlist across coverage competition and industry", async () => {
  const adminToken = await ensureAdminUser();
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
      headers: authHeaders(adminToken)
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
        ...authHeaders(adminToken)
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
        ...authHeaders(adminToken)
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
  // admin_01 is a real registered user (upserted above), so the gateway's allowlist
  // check passes and the industry-portal-service creates the mandate (201).

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

  // Admin request: gateway allowlist passes (Bearer token resolves to admin_01 which is in the
  // INDUSTRY_ADMIN_ALLOWLIST). admin_01 is a real user so the industry service creates the mandate.
  const industryAdminResponse = await jsonRequest<{ error?: string; mandate?: unknown }>(
    `${API_BASE_URL}/api/v1/industry/mandates`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify(mandatePayload)
    }
  );
  assert.ok(
    [200, 201].includes(industryAdminResponse.status),
    `expected 200 or 201 from industry service for admin mandate creation, got ${industryAdminResponse.status}: ${industryAdminResponse.rawBody}`
  );
});
