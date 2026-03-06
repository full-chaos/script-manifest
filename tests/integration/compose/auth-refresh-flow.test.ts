import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, registerUser } from "./helpers.js";

type AuthSessionResponse = {
  token: string;
  refreshToken?: string;
  user: { id: string; email: string; displayName: string };
};

test("compose flow: auth refresh rotates sessions and rejects refresh token reuse", async () => {
  const registered = (await registerUser("auth-refresh-flow")) as AuthSessionResponse;
  const firstRefreshToken = registered.refreshToken;
  assert.ok(firstRefreshToken, "expected register to return refresh token");

  const meBeforeRefresh = await expectOkJson<{ user: { id: string } }>(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: authHeaders(registered.token)
  });
  assert.equal(meBeforeRefresh.user.id, registered.user.id);

  const refreshed = await expectOkJson<AuthSessionResponse>(
    `${API_BASE_URL}/api/v1/auth/refresh`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: firstRefreshToken })
    },
    200
  );
  assert.ok(refreshed.token.length > 0);
  assert.ok(refreshed.refreshToken, "expected refresh response to include rotated refresh token");
  assert.notEqual(refreshed.token, registered.token);
  assert.notEqual(refreshed.refreshToken, firstRefreshToken);

  const meAfterRefresh = await expectOkJson<{ user: { id: string } }>(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: authHeaders(refreshed.token)
  });
  assert.equal(meAfterRefresh.user.id, registered.user.id);

  const reuseAttempt = await jsonRequest<{ error?: string }>(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: firstRefreshToken })
  });
  assert.equal(reuseAttempt.status, 401);
  assert.equal(reuseAttempt.body.error, "refresh_token_reuse_detected");

  const familyRevokedAttempt = await jsonRequest<{ error?: string }>(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshed.refreshToken })
  });
  assert.equal(familyRevokedAttempt.status, 401);
  assert.equal(familyRevokedAttempt.body.error, "invalid_refresh_token");

  const logoutResponse = await jsonRequest<unknown>(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    headers: authHeaders(refreshed.token)
  });
  assert.equal(logoutResponse.status, 204);

  const meAfterLogout = await jsonRequest<{ error?: string }>(`${API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: authHeaders(refreshed.token)
  });
  assert.equal(meAfterLogout.status, 401);
});
