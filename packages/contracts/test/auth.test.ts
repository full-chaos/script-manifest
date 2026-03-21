import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthSessionResponseSchema,
  AuthMeResponseSchema,
  OAuthStartRequestSchema,
  OAuthCompleteRequestSchema
} from "../src/auth.js";

test("OAuthStartRequestSchema accepts optional redirect and login hint", () => {
  const parsed = OAuthStartRequestSchema.parse({
    redirectUri: "https://app.example.com/callback",
    loginHint: "writer@example.com"
  });
  assert.equal(parsed.loginHint, "writer@example.com");
});

test("OAuthCompleteRequestSchema rejects short state/code", () => {
  const result = OAuthCompleteRequestSchema.safeParse({ state: "short", code: "short" });
  assert.equal(result.success, false);
});

test("AuthSessionResponseSchema validates token payload", () => {
  const parsed = AuthSessionResponseSchema.parse({
    token: "jwt-token",
    refreshToken: "refresh-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    user: {
      id: "user_1",
      email: "writer@example.com",
      displayName: "Writer",
      role: "writer",
      emailVerified: true
    }
  });
  assert.equal(parsed.user.email, "writer@example.com");
});

test("AuthMeResponseSchema enforces ISO expiresAt", () => {
  const valid = AuthMeResponseSchema.safeParse({
    user: { id: "user_1", email: "writer@example.com", displayName: "Writer", emailVerified: true },
    expiresAt: "2026-01-01T00:00:00.000Z"
  });
  const invalid = AuthMeResponseSchema.safeParse({
    user: { id: "user_1", email: "writer@example.com", displayName: "Writer", emailVerified: true },
    expiresAt: "not-a-date"
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
