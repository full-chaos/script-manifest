import assert from "node:assert/strict";
import test from "node:test";
import { generateTotpCode } from "../../../services/identity-service/src/totp.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, registerUser } from "./helpers.js";

type MfaChallengeResponse = {
  requiresMfa?: boolean;
  mfaToken?: string;
  token?: string;
};

test("compose flow: MFA TOTP enrollment challenge verification and disable", async () => {
  const user = await registerUser("mfa-totp-flow");

  const setup = await expectOkJson<{ secret: string }>(
    `${API_BASE_URL}/api/v1/auth/mfa/setup`,
    {
      method: "POST",
      headers: authHeaders(user.token)
    },
    200
  );
  assert.ok(setup.secret.length > 0);

  const verifySetup = await expectOkJson<{ enabled: boolean; backupCodes: string[] }>(
    `${API_BASE_URL}/api/v1/auth/mfa/verify-setup`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(user.token)
      },
      body: JSON.stringify({ code: generateTotpCode(setup.secret) })
    },
    200
  );
  assert.equal(verifySetup.enabled, true);
  assert.ok(verifySetup.backupCodes.length > 0);

  const logout = await jsonRequest<unknown>(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    headers: authHeaders(user.token)
  });
  assert.equal(logout.status, 204);

  const loginChallenge = await expectOkJson<MfaChallengeResponse>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.user.email, password: "StrongPass1!" })
  }, 200);
  assert.equal(loginChallenge.requiresMfa, true);
  assert.ok(loginChallenge.mfaToken, "expected MFA challenge token");

  const verifiedLogin = await expectOkJson<{ token: string }>(`${API_BASE_URL}/api/v1/auth/mfa/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mfaToken: loginChallenge.mfaToken,
      code: generateTotpCode(setup.secret)
    })
  }, 200);
  assert.ok(verifiedLogin.token.length > 0);

  await expectOkJson<{ ok: boolean }>(`${API_BASE_URL}/api/v1/auth/mfa/disable`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(verifiedLogin.token)
    },
    body: JSON.stringify({
      password: "StrongPass1!",
      code: generateTotpCode(setup.secret)
    })
  }, 200);

  const loginWithoutMfa = await expectOkJson<MfaChallengeResponse>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.user.email, password: "StrongPass1!" })
  }, 200);
  assert.equal(loginWithoutMfa.requiresMfa, undefined);
  assert.ok(loginWithoutMfa.token, "expected direct session token after disabling MFA");
});
