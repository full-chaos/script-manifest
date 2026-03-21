import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, makeUnique } from "./helpers.js";

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

  const login = await expectOkJson<{ token: string }>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  }, 200);
  return login.token;
}

test("compose flow: feature flag create list toggle client-evaluate and delete", async () => {
  const adminToken = await ensureAdminUser();
  const flagKey = makeUnique("ff");

  const created = await expectOkJson<{ flag: { key: string; enabled: boolean } }>(
    `${API_BASE_URL}/api/v1/admin/feature-flags`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify({
        key: flagKey,
        description: "Feature flag integration lifecycle test",
        enabled: false
      })
    },
    201
  );
  assert.equal(created.flag.key, flagKey);
  assert.equal(created.flag.enabled, false);

  const listedAfterCreate = await expectOkJson<{ flags: Array<{ key: string; enabled: boolean }> }>(
    `${API_BASE_URL}/api/v1/admin/feature-flags`,
    {
      method: "GET",
      headers: authHeaders(adminToken)
    },
    200
  );
  assert.ok(listedAfterCreate.flags.some((flag) => flag.key === flagKey));

  await expectOkJson<{ flag: { key: string; enabled: boolean } }>(
    `${API_BASE_URL}/api/v1/admin/feature-flags/${encodeURIComponent(flagKey)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify({ enabled: true })
    },
    200
  );

  const clientFlagsEnabled = await expectOkJson<{ flags: Record<string, boolean> }>(
    `${API_BASE_URL}/api/v1/feature-flags`,
    {
      method: "GET",
      headers: authHeaders(adminToken)
    },
    200
  );
  assert.equal(clientFlagsEnabled.flags[flagKey], true);

  await expectOkJson<{ flag: { key: string; enabled: boolean } }>(
    `${API_BASE_URL}/api/v1/admin/feature-flags/${encodeURIComponent(flagKey)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify({ enabled: false })
    },
    200
  );

  const clientFlagsDisabled = await expectOkJson<{ flags: Record<string, boolean> }>(
    `${API_BASE_URL}/api/v1/feature-flags`,
    {
      method: "GET",
      headers: authHeaders(adminToken)
    },
    200
  );
  assert.equal(clientFlagsDisabled.flags[flagKey], false);

  const deleted = await jsonRequest<unknown>(
    `${API_BASE_URL}/api/v1/admin/feature-flags/${encodeURIComponent(flagKey)}`,
    {
      method: "DELETE",
      headers: authHeaders(adminToken)
    }
  );
  assert.equal(deleted.status, 204);

  const listedAfterDelete = await expectOkJson<{ flags: Array<{ key: string }> }>(
    `${API_BASE_URL}/api/v1/admin/feature-flags`,
    {
      method: "GET",
      headers: authHeaders(adminToken)
    },
    200
  );
  assert.equal(listedAfterDelete.flags.some((flag) => flag.key === flagKey), false);
});
