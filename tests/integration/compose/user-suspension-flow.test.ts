import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, registerUser } from "./helpers.js";

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

test("compose flow: admin suspension blocks login until unsuspended", async () => {
  const adminToken = await ensureAdminUser();
  const regular = await registerUser("suspension-regular");

  await expectOkJson<{ user: { id: string } }>(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: authHeaders(regular.token)
  }, 200);

  const suspended = await expectOkJson<{ suspension: { id: string; userId: string } }>(
    `${API_BASE_URL}/api/v1/admin/users/${encodeURIComponent(regular.user.id)}/suspend`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify({ reason: "integration suspension test", durationDays: 7 })
    },
    201
  );
  assert.equal(suspended.suspension.userId, regular.user.id);

  const blockedLogin = await jsonRequest<{ error?: string }>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: regular.user.email, password: "StrongPass1!" })
  });
  assert.equal(blockedLogin.status, 403);
  assert.equal(blockedLogin.body.error, "account_suspended");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/users/${encodeURIComponent(regular.user.id)}/unsuspend`,
    {
      method: "POST",
      headers: authHeaders(adminToken)
    },
    200
  );

  const unblockedLogin = await expectOkJson<{ token: string }>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: regular.user.email, password: "StrongPass1!" })
  }, 200);
  assert.ok(unblockedLogin.token.length > 0);

  await expectOkJson<{ user: { id: string } }>(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: authHeaders(unblockedLogin.token)
  }, 200);
});
