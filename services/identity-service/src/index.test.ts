import assert from "node:assert/strict";
import test from "node:test";
import type {
  IdentityRepository,
  RefreshTokenIssue,
  RefreshTokenRotateResult,
  IdentitySession,
  IdentityUser,
  OAuthStateRecord,
  RegisterUserInput
} from "./repository.js";
import { BaseMemoryRepository } from "@script-manifest/service-utils";
import { buildServer } from "./index.js";
import { hashPassword } from "./repository.js";

class MemoryRepo extends BaseMemoryRepository implements IdentityRepository {
  private users = new Map<string, IdentityUser>();
  private usersByEmail = new Map<string, string>();
  private sessions = new Map<string, IdentitySession>();
  private oauthStates = new Map<string, OAuthStateRecord>();
  private emailVerifCodes = new Map<string, { codeHash: string; expiresAt: number }>();
  private resetTokens = new Map<string, { userId: string; usedAt?: string; expiresAt: number }>();
  private unlockTokens = new Map<string, { userId: string; usedAt?: string; expiresAt: number }>();
  private refreshTokens = new Map<string, {
    userId: string;
    familyId: string;
    expiresAt: string;
    usedAt?: string;
    revokedAt?: string;
  }>();

  override async init(): Promise<void> {}

  override async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const email = input.email.toLowerCase();
    if (this.usersByEmail.has(email)) {
      return null;
    }

    const id = this.createId("user");
    const passwordSalt = this.createId("salt");
    const user: IdentityUser = {
      id,
      email,
      displayName: input.displayName,
      passwordSalt,
      passwordHash: hashPassword(input.password, passwordSalt),
      role: "writer",
      accountStatus: "active",
      failedLoginAttempts: 0,
      lockedUntil: null
    };
    this.users.set(id, user);
    this.usersByEmail.set(email, id);
    return user;
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const userId = this.usersByEmail.get(email.toLowerCase());
    return userId ? (this.users.get(userId) ?? null) : null;
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const token = this.createId("sess");
    const session: IdentitySession = {
      token,
      userId,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    this.sessions.set(token, session);
    return session;
  }

  async findUserBySessionToken(
    token: string
  ): Promise<{ user: IdentityUser; session: IdentitySession } | null> {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user) {
      return null;
    }

    return { user, session };
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(token);
    }
  }

  async saveOAuthState(state: string, record: OAuthStateRecord): Promise<void> {
    this.oauthStates.set(state, record);
  }

  async getAndDeleteOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const record = this.oauthStates.get(state);
    if (!record) {
      return null;
    }
    this.oauthStates.delete(state);
    return record;
  }

  async cleanExpiredOAuthState(): Promise<void> {
    const now = new Date().toISOString();
    for (const [state, record] of this.oauthStates) {
      if (record.expiresAt < now) {
        this.oauthStates.delete(state);
      }
    }
  }

  async createEmailVerificationToken(userId: string): Promise<{ code: string }> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { createHash } = await import("node:crypto");
    const codeHash = createHash("sha256").update(code).digest("hex");
    this.emailVerifCodes.set(userId, { codeHash, expiresAt: Date.now() + 15 * 60 * 1000 });
    return { code };
  }

  async verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const entry = this.emailVerifCodes.get(userId);
    if (!entry || entry.expiresAt <= Date.now()) return false;
    const { createHash } = await import("node:crypto");
    const codeHash = createHash("sha256").update(code).digest("hex");
    if (entry.codeHash !== codeHash) return false;
    this.emailVerifCodes.delete(userId);
    return true;
  }

  async markEmailVerified(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      // In-memory only — no actual column to set
    }
  }

  async createPasswordResetToken(userId: string): Promise<{ token: string }> {
    const token = this.createId("prt");
    this.resetTokens.set(token, { userId, expiresAt: Date.now() + 60 * 60 * 1000 });
    return { token };
  }

  async consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
    const entry = this.resetTokens.get(token);
    if (!entry || entry.usedAt || entry.expiresAt <= Date.now()) return null;
    entry.usedAt = new Date().toISOString();
    return { userId: entry.userId };
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const salt = this.createId("salt");
      user.passwordSalt = salt;
      user.passwordHash = hashPassword(password, salt);
    }
  }

  async recordFailedLoginAttempt(userId: string): Promise<{ failedLoginAttempts: number; lockedUntil: string | null }> {
    const user = this.users.get(userId);
    if (!user) {
      return { failedLoginAttempts: 0, lockedUntil: null };
    }

    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 15) {
      user.lockedUntil = null;
    } else if (user.failedLoginAttempts >= 10) {
      user.lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } else if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    return {
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil
    };
  }

  async resetLoginLockout(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }

  async createAccountUnlockToken(userId: string): Promise<{ token: string }> {
    const token = this.createId("aut");
    this.unlockTokens.set(token, {
      userId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    });
    return { token };
  }

  async consumeAccountUnlockToken(token: string): Promise<{ userId: string } | null> {
    const entry = this.unlockTokens.get(token);
    if (!entry || entry.usedAt || entry.expiresAt <= Date.now()) {
      return null;
    }

    entry.usedAt = new Date().toISOString();
    return { userId: entry.userId };
  }

  async softDeleteUser(userId: string): Promise<void> {
    // Mark as deleted, remove sessions
    await this.deleteUserSessions(userId);
  }

  async createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const token = this.createId("rfr");
    const finalFamilyId = familyId ?? this.createId("fam");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    this.refreshTokens.set(token, {
      userId,
      familyId: finalFamilyId,
      expiresAt,
    });
    return {
      refreshToken: token,
      familyId: finalFamilyId,
      expiresAt,
    };
  }

  async rotateRefreshToken(rawToken: string): Promise<RefreshTokenRotateResult> {
    const token = this.refreshTokens.get(rawToken);
    if (!token) {
      return { status: "invalid" };
    }

    if (token.usedAt) {
      return { status: "reuse_detected", familyId: token.familyId };
    }

    if (token.revokedAt || new Date(token.expiresAt).getTime() <= Date.now()) {
      return { status: "invalid" };
    }

    token.usedAt = new Date().toISOString();
    const next = await this.createRefreshToken(token.userId, token.familyId);
    return {
      status: "rotated",
      userId: token.userId,
      ...next,
    };
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === familyId) {
        token.revokedAt = new Date().toISOString();
      }
    }
  }
}

test("identity register/login/me/logout flow", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const register = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "writer@example.com",
      password: "Password123!",
      displayName: "Writer One",
      acceptTerms: true
    }
  });
  assert.equal(register.statusCode, 201);
  const registerPayload = register.json();
  assert.ok(registerPayload.token);
  assert.ok(registerPayload.refreshToken);

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "writer@example.com",
      password: "Password123!"
    }
  });
  assert.equal(login.statusCode, 200);
  const token = login.json().token as string;
  assert.ok(login.json().refreshToken);

  const me = await server.inject({
    method: "GET",
    url: "/internal/auth/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(me.statusCode, 200);

  const logout = await server.inject({
    method: "POST",
    url: "/internal/auth/logout",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(logout.statusCode, 204);
});

test("identity register rejects duplicate email", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const payload = {
    email: "writer@example.com",
    password: "Password123!",
    displayName: "Writer One",
    acceptTerms: true as const
  };

  const first = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload
  });
  assert.equal(first.statusCode, 201);

  const second = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "email_already_registered");
});

test("identity login rejects invalid credentials", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "writer@example.com",
      password: "Password123!",
      displayName: "Writer One",
      acceptTerms: true
    }
  });

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "writer@example.com",
      password: "wrong-password"
    }
  });

  assert.equal(login.statusCode, 401);
  assert.equal(login.json().error, "invalid_credentials");
});

test("identity login resets failed attempts after success", async (t) => {
  const repo = new MemoryRepo();
  const server = buildServer({ logger: false, repository: repo });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "lock-reset@example.com",
      password: "Password123!",
      displayName: "Lock Reset",
      acceptTerms: true
    }
  });

  for (let i = 0; i < 4; i += 1) {
    const bad = await server.inject({
      method: "POST",
      url: "/internal/auth/login",
      payload: {
        email: "lock-reset@example.com",
        password: "wrong-password"
      }
    });
    assert.equal(bad.statusCode, 401);
  }

  const firstGood = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-reset@example.com",
      password: "Password123!"
    }
  });
  assert.equal(firstGood.statusCode, 200);

  const postSuccessBad = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-reset@example.com",
      password: "wrong-password"
    }
  });
  assert.equal(postSuccessBad.statusCode, 401);

  const secondGood = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-reset@example.com",
      password: "Password123!"
    }
  });
  assert.equal(secondGood.statusCode, 200);
});

test("identity login locks account after five failures with generic error", async (t) => {
  const repo = new MemoryRepo();
  const server = buildServer({ logger: false, repository: repo });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "lock-five@example.com",
      password: "Password123!",
      displayName: "Lock Five",
      acceptTerms: true
    }
  });

  let wrongPasswordPayload: unknown = null;
  for (let i = 0; i < 5; i += 1) {
    const bad = await server.inject({
      method: "POST",
      url: "/internal/auth/login",
      payload: {
        email: "lock-five@example.com",
        password: "wrong-password"
      }
    });
    assert.equal(bad.statusCode, 401);
    wrongPasswordPayload = bad.json();
  }

  const locked = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-five@example.com",
      password: "Password123!"
    }
  });
  assert.equal(locked.statusCode, 401);
  assert.deepEqual(locked.json(), wrongPasswordPayload);
});

test("identity unlock-account endpoint unlocks permanent lockout", async (t) => {
  const { MemoryEmailService } = await import("@script-manifest/email");
  const emailService = new MemoryEmailService();
  const repo = new MemoryRepo();
  const server = buildServer({ logger: false, repository: repo, emailService });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "lock-fifteen@example.com",
      password: "Password123!",
      displayName: "Lock Fifteen",
      acceptTerms: true
    }
  });

  for (let i = 0; i < 15; i += 1) {
    const bad = await server.inject({
      method: "POST",
      url: "/internal/auth/login",
      payload: {
        email: "lock-fifteen@example.com",
        password: "wrong-password"
      }
    });
    assert.equal(bad.statusCode, 401);

    const user = await repo.findUserByEmail("lock-fifteen@example.com");
    if (user?.lockedUntil) {
      user.lockedUntil = new Date(Date.now() - 1_000).toISOString();
    }
  }

  const locked = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-fifteen@example.com",
      password: "Password123!"
    }
  });
  assert.equal(locked.statusCode, 401);
  assert.equal(locked.json().error, "invalid_credentials");

  const lockoutEmail = emailService.sentEmails.find((message: { template: string }) => message.template === "account-lockout");
  assert.ok(lockoutEmail);
  const unlockUrl = lockoutEmail?.data.unlockUrl;
  assert.ok(unlockUrl);
  const token = new URL(unlockUrl as string).searchParams.get("token");
  assert.ok(token);

  const unlock = await server.inject({
    method: "POST",
    url: "/internal/auth/unlock-account",
    payload: { token }
  });
  assert.equal(unlock.statusCode, 200);
  assert.equal(unlock.json().ok, true);

  const unlockedLogin = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "lock-fifteen@example.com",
      password: "Password123!"
    }
  });
  assert.equal(unlockedLogin.statusCode, 200);
});

test("identity me/logout require bearer token", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const me = await server.inject({
    method: "GET",
    url: "/internal/auth/me"
  });
  assert.equal(me.statusCode, 401);
  assert.equal(me.json().error, "missing_bearer_token");

  const logout = await server.inject({
    method: "POST",
    url: "/internal/auth/logout"
  });
  assert.equal(logout.statusCode, 401);
  assert.equal(logout.json().error, "missing_bearer_token");
});

test("identity oauth start/complete issues session and enforces one-time state", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const start = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/google/start",
    payload: { loginHint: "Writer Two" }
  });
  assert.equal(start.statusCode, 201);
  const startPayload = start.json();
  assert.equal(startPayload.provider, "google");
  assert.match(startPayload.authorizationUrl as string, /state=/);
  assert.match(startPayload.authorizationUrl as string, /code=/);
  assert.ok(startPayload.codeChallenge, "response should contain codeChallenge");

  const complete = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/google/complete",
    payload: {
      state: startPayload.state,
      code: startPayload.mockCode
    }
  });
  assert.equal(complete.statusCode, 200);
  assert.ok(complete.json().token);
  assert.ok(complete.json().refreshToken);
  assert.match(complete.json().user.email as string, /^google\+writer-two@oauth\.local$/);

  const replay = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/google/complete",
    payload: {
      state: startPayload.state,
      code: startPayload.mockCode
    }
  });
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.json().error, "invalid_oauth_state");
});

test("identity oauth callback validates code", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const start = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/google/start"
  });
  assert.equal(start.statusCode, 201);
  const startPayload = start.json();

  const callback = await server.inject({
    method: "GET",
    url: `/internal/auth/oauth/google/callback?state=${encodeURIComponent(startPayload.state as string)}&code=${"1".repeat(32)}`
  });
  assert.equal(callback.statusCode, 400);
  assert.equal(callback.json().error, "invalid_oauth_code");
});

test("identity refresh rotates token and blocks reuse", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "refresh@example.com",
      password: "Password123!",
      displayName: "Refresh User",
      acceptTerms: true
    }
  });
  assert.equal(login.statusCode, 201);
  const firstRefreshToken = login.json().refreshToken as string;

  const refresh = await server.inject({
    method: "POST",
    url: "/internal/auth/refresh",
    payload: { refreshToken: firstRefreshToken }
  });
  assert.equal(refresh.statusCode, 200);
  const secondRefreshToken = refresh.json().refreshToken as string;
  assert.ok(secondRefreshToken);
  assert.notEqual(secondRefreshToken, firstRefreshToken);

  const reused = await server.inject({
    method: "POST",
    url: "/internal/auth/refresh",
    payload: { refreshToken: firstRefreshToken }
  });
  assert.equal(reused.statusCode, 401);
  assert.equal(reused.json().error, "refresh_token_reuse_detected");

  const revokedFamily = await server.inject({
    method: "POST",
    url: "/internal/auth/refresh",
    payload: { refreshToken: secondRefreshToken }
  });
  assert.equal(revokedFamily.statusCode, 401);
  assert.equal(revokedFamily.json().error, "invalid_refresh_token");
});

test("register rejects missing acceptTerms", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "noterms@example.com",
      password: "Password123!",
      displayName: "No Terms"
    }
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_payload");
});

test("email verification flow", async (t) => {
  const { MemoryEmailService } = await import("@script-manifest/email");
  const emailService = new MemoryEmailService();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), emailService });
  t.after(async () => { await server.close(); });

  // Register sends verification email
  const reg = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email: "verify@example.com", password: "Password123!", displayName: "Verify User", acceptTerms: true }
  });
  assert.equal(reg.statusCode, 201);
  const token = reg.json().token as string;
  assert.equal(emailService.sentEmails.length, 1);
  assert.equal(emailService.sentEmails[0]!.template, "verification-code");

  // Extract code from the email service (in real code this would be in the email)
  const code = emailService.sentEmails[0]!.data.code!;

  // Wrong code fails
  const bad = await server.inject({
    method: "POST",
    url: "/internal/auth/verify-email",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: "000000" }
  });
  assert.equal(bad.statusCode, 400);

  // Correct code works and sends welcome email
  const good = await server.inject({
    method: "POST",
    url: "/internal/auth/verify-email",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code }
  });
  assert.equal(good.statusCode, 200);
  assert.equal(good.json().ok, true);
  assert.equal(emailService.sentEmails.length, 2);
  assert.equal(emailService.sentEmails[1]!.template, "welcome");
});

test("resend verification requires auth", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/resend-verification"
  });
  assert.equal(res.statusCode, 401);
});

test("forgot-password does not reveal email existence", async (t) => {
  const { MemoryEmailService } = await import("@script-manifest/email");
  const emailService = new MemoryEmailService();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), emailService });
  t.after(async () => { await server.close(); });

  // Non-existent email: still returns ok
  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/forgot-password",
    payload: { email: "nobody@example.com" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  assert.equal(emailService.sentEmails.length, 0); // No email sent
});

test("password reset flow: forgot → reset → login with new password", async (t) => {
  const { MemoryEmailService } = await import("@script-manifest/email");
  const emailService = new MemoryEmailService();
  const repo = new MemoryRepo();
  const server = buildServer({ logger: false, repository: repo, emailService });
  t.after(async () => { await server.close(); });

  // Register
  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email: "reset@example.com", password: "Oldpassword1!", displayName: "Reset User", acceptTerms: true }
  });
  emailService.clear();

  // Forgot password
  const forgot = await server.inject({
    method: "POST",
    url: "/internal/auth/forgot-password",
    payload: { email: "reset@example.com" }
  });
  assert.equal(forgot.statusCode, 200);
  assert.equal(emailService.sentEmails.length, 1);
  assert.equal(emailService.sentEmails[0]!.template, "password-reset");

  // Extract token from email data
  const resetUrl = emailService.sentEmails[0]!.data.resetUrl!;
  const resetToken = new URL(resetUrl).searchParams.get("token")!;

  // Reset password
  const reset = await server.inject({
    method: "POST",
    url: "/internal/auth/reset-password",
    payload: { token: resetToken, password: "Newpassword1!" }
  });
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.json().ok, true);

  // Login with old password fails
  const oldLogin = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "reset@example.com", password: "Oldpassword1!" }
  });
  assert.equal(oldLogin.statusCode, 401);

  // Login with new password works
  const newLogin = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "reset@example.com", password: "Newpassword1!" }
  });
  assert.equal(newLogin.statusCode, 200);
  assert.ok(newLogin.json().token);
});

test("password reset rejects used token", async (t) => {
  const { MemoryEmailService } = await import("@script-manifest/email");
  const emailService = new MemoryEmailService();
  const repo = new MemoryRepo();
  const server = buildServer({ logger: false, repository: repo, emailService });
  t.after(async () => { await server.close(); });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email: "reuse@example.com", password: "Password123!", displayName: "Reuse User", acceptTerms: true }
  });
  emailService.clear();

  await server.inject({
    method: "POST",
    url: "/internal/auth/forgot-password",
    payload: { email: "reuse@example.com" }
  });

  const resetUrl = emailService.sentEmails[0]!.data.resetUrl!;
  const resetToken = new URL(resetUrl).searchParams.get("token")!;

  // First use succeeds
  const first = await server.inject({
    method: "POST",
    url: "/internal/auth/reset-password",
    payload: { token: resetToken, password: "Newpassword1!" }
  });
  assert.equal(first.statusCode, 200);

  // Second use fails (token already consumed)
  const second = await server.inject({
    method: "POST",
    url: "/internal/auth/reset-password",
    payload: { token: resetToken, password: "Anotherpass1!" }
  });
  assert.equal(second.statusCode, 400);
  assert.equal(second.json().error, "invalid_or_expired_token");
});

test("register rejects acceptTerms: false", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "falseterms@example.com",
      password: "Password123!",
      displayName: "False Terms",
      acceptTerms: false
    }
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_payload");
});

test("account deletion requires password confirmation", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const reg = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email: "delete@example.com", password: "Password123!", displayName: "Delete Me", acceptTerms: true }
  });
  const token = reg.json().token as string;

  // Wrong password
  const bad = await server.inject({
    method: "DELETE",
    url: "/internal/auth/account",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { password: "wrongpassword" }
  });
  assert.equal(bad.statusCode, 403);
  assert.equal(bad.json().error, "invalid_password");

  // Correct password
  const good = await server.inject({
    method: "DELETE",
    url: "/internal/auth/account",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { password: "Password123!" }
  });
  assert.equal(good.statusCode, 200);
  assert.equal(good.json().ok, true);
});

test("account deletion requires auth", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "DELETE",
    url: "/internal/auth/account",
    payload: { password: "anything" }
  });
  assert.equal(res.statusCode, 401);
});
