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
import { MemoryMfaRepository } from "./mfa-repository.js";
import { buildServer } from "./index.js";
import { hashPassword } from "./repository.js";
import { generateTotpCode } from "./totp.js";

// ── Memory Repository (same pattern as index.test.ts) ─────────────────

class MemoryRepo extends BaseMemoryRepository implements IdentityRepository {
  private users = new Map<string, IdentityUser>();
  private usersByEmail = new Map<string, string>();
  private sessions = new Map<string, IdentitySession>();
  private oauthStates = new Map<string, OAuthStateRecord>();
  private emailVerifCodes = new Map<string, { codeHash: string; expiresAt: number }>();
  private resetTokens = new Map<string, { userId: string; usedAt?: string; expiresAt: number }>();
  private refreshTokens = new Map<string, {
    userId: string;
    familyId: string;
    expiresAt: string;
    usedAt?: string;
    revokedAt?: string;
  }>();

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const email = input.email.toLowerCase();
    if (this.usersByEmail.has(email)) return null;

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
      lockedUntil: null,
      mfaEnabled: false,
      emailVerified: false
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
    if (!session) return null;
    const user = this.users.get(session.userId);
    if (!user) return null;
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
    if (!record) return null;
    this.oauthStates.delete(state);
    return record;
  }

  async cleanExpiredOAuthState(): Promise<void> {
    const now = new Date().toISOString();
    for (const [state, record] of this.oauthStates) {
      if (record.expiresAt < now) this.oauthStates.delete(state);
    }
  }

  async createEmailVerificationToken(_userId: string): Promise<{ code: string }> {
    return { code: "123456" };
  }

  async verifyEmailCode(_userId: string, _code: string): Promise<boolean> {
    return true;
  }

  async markEmailVerified(_userId: string): Promise<void> {}

  async createPasswordResetToken(_userId: string): Promise<{ token: string }> {
    return { token: "reset_token" };
  }

  async consumePasswordResetToken(_token: string): Promise<{ userId: string } | null> {
    return null;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const salt = this.createId("salt");
      user.passwordSalt = salt;
      user.passwordHash = hashPassword(password, salt);
    }
  }

  async softDeleteUser(userId: string): Promise<void> {
    await this.deleteUserSessions(userId);
  }

  async createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const token = this.createId("rfr");
    const finalFamilyId = familyId ?? this.createId("fam");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    this.refreshTokens.set(token, { userId, familyId: finalFamilyId, expiresAt });
    return { refreshToken: token, familyId: finalFamilyId, expiresAt };
  }

  async rotateRefreshToken(rawToken: string): Promise<RefreshTokenRotateResult> {
    const token = this.refreshTokens.get(rawToken);
    if (!token) return { status: "invalid" };
    if (token.usedAt) return { status: "reuse_detected", familyId: token.familyId };
    if (token.revokedAt || new Date(token.expiresAt).getTime() <= Date.now()) return { status: "invalid" };
    token.usedAt = new Date().toISOString();
    const next = await this.createRefreshToken(token.userId, token.familyId);
    return { status: "rotated", userId: token.userId, ...next };
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === familyId) token.revokedAt = new Date().toISOString();
    }
  }

  /** Enable MFA on a user in-memory (for testing the login flow). */
  setMfaEnabled(userId: string): void {
    const user = this.users.get(userId);
    if (user) user.mfaEnabled = true;
  }
}

// ── Helper: register user and get session token ───────────────────────

async function registerAndGetToken(
  server: ReturnType<typeof buildServer>,
  email = "mfa@example.com",
  password = "StrongPass1!"
) {
  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email, password, displayName: "MFA User", acceptTerms: true }
  });
  assert.equal(res.statusCode, 201, `Registration failed: ${res.body}`);
  const payload = res.json();
  return { token: payload.token as string, userId: payload.user.id as string };
}

// ── Tests ─────────────────────────────────────────────────────────────

test("MFA setup returns secret and otpauth URL", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.secret);
  assert.ok(body.otpauthUrl);
  assert.ok(body.otpauthUrl.startsWith("otpauth://totp/"));
  assert.ok(body.qrCodeDataUrl);
});

test("MFA setup requires auth", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup"
  });
  assert.equal(res.statusCode, 401);
});

test("MFA verify-setup activates MFA and returns backup codes", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  // Setup
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;

  // Generate a valid TOTP code
  const code = generateTotpCode(secret);

  // Verify setup
  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code }
  });

  assert.equal(verify.statusCode, 200);
  const body = verify.json();
  assert.equal(body.enabled, true);
  assert.ok(Array.isArray(body.backupCodes));
  assert.equal(body.backupCodes.length, 10);
});

test("MFA verify-setup rejects invalid code", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });

  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: "000000" }
  });

  assert.equal(verify.statusCode, 400);
  assert.equal(verify.json().error, "invalid_totp_code");
});

test("MFA verify-setup requires pending setup", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: "123456" }
  });

  assert.equal(verify.statusCode, 400);
  assert.equal(verify.json().error, "no_pending_mfa_setup");
});

test("MFA status returns false when not enabled", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  const res = await server.inject({
    method: "GET",
    url: "/internal/auth/mfa/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().mfaEnabled, false);
  assert.equal(res.json().enabledAt, null);
});

test("MFA status returns true after enabling", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  // Setup
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  const code = generateTotpCode(secret);

  // Verify setup
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code }
  });

  const status = await server.inject({
    method: "GET",
    url: "/internal/auth/mfa/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(status.statusCode, 200);
  assert.equal(status.json().mfaEnabled, true);
  assert.ok(status.json().enabledAt);
});

test("MFA setup rejects when already enabled", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  // Setup + enable
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  // Try setup again
  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "mfa_already_enabled");
});

test("MFA disable requires password and TOTP code", async (t) => {
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: new MemoryRepo(), mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetToken(server);

  // Setup + enable
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  // Disable with wrong password
  const badPassword = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/disable",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { password: "wrongpassword", code: generateTotpCode(secret) }
  });
  assert.equal(badPassword.statusCode, 403);
  assert.equal(badPassword.json().error, "invalid_password");

  // Disable with wrong TOTP
  const badTotp = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/disable",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { password: "StrongPass1!", code: "000000" }
  });
  assert.equal(badTotp.statusCode, 400);
  assert.equal(badTotp.json().error, "invalid_totp_code");

  // Disable with correct credentials
  const good = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/disable",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { password: "StrongPass1!", code: generateTotpCode(secret) }
  });
  assert.equal(good.statusCode, 200);
  assert.equal(good.json().ok, true);

  // Status should now show disabled
  const status = await server.inject({
    method: "GET",
    url: "/internal/auth/mfa/status",
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(status.json().mfaEnabled, false);
});

test("Login with MFA enabled returns mfa challenge instead of session", async (t) => {
  const identityRepo = new MemoryRepo();
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: identityRepo, mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetToken(server);

  // Setup + enable MFA
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  // Mark user as MFA enabled in identity repo
  identityRepo.setMfaEnabled(userId);

  // Now login should return MFA challenge
  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "mfa@example.com", password: "StrongPass1!" }
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().requiresMfa, true);
  assert.ok(login.json().mfaToken);
});

test("MFA verify during login creates session with valid TOTP code", async (t) => {
  const identityRepo = new MemoryRepo();
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: identityRepo, mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetToken(server);

  // Setup + enable MFA
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  identityRepo.setMfaEnabled(userId);

  // Login to get MFA challenge
  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "mfa@example.com", password: "StrongPass1!" }
  });
  const mfaToken = login.json().mfaToken as string;

  // Verify MFA with TOTP code
  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken, code: generateTotpCode(secret) }
  });

  assert.equal(verify.statusCode, 200);
  const body = verify.json();
  assert.ok(body.token);
  assert.ok(body.refreshToken);
  assert.ok(body.user);
  assert.equal(body.user.email, "mfa@example.com");
});

test("MFA verify during login works with backup code", async (t) => {
  const identityRepo = new MemoryRepo();
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: identityRepo, mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetToken(server);

  // Setup + enable MFA
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  const verifySetup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });
  const backupCodes = verifySetup.json().backupCodes as string[];

  identityRepo.setMfaEnabled(userId);

  // Login
  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "mfa@example.com", password: "StrongPass1!" }
  });
  const mfaToken = login.json().mfaToken as string;

  // Verify with backup code
  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken, code: backupCodes[0] }
  });

  assert.equal(verify.statusCode, 200);
  assert.ok(verify.json().token);
});

test("MFA verify rejects invalid code", async (t) => {
  const identityRepo = new MemoryRepo();
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: identityRepo, mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetToken(server);

  // Setup + enable
  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  identityRepo.setMfaEnabled(userId);

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "mfa@example.com", password: "StrongPass1!" }
  });
  const mfaToken = login.json().mfaToken as string;

  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken, code: "999999" }
  });

  assert.equal(verify.statusCode, 401);
  assert.equal(verify.json().error, "invalid_mfa_code");
});

test("MFA verify rejects expired/invalid mfaToken", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => { await server.close(); });

  const verify = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken: "nonexistent_token", code: "123456" }
  });

  assert.equal(verify.statusCode, 401);
  assert.equal(verify.json().error, "invalid_or_expired_mfa_token");
});

test("MFA mfaToken is single-use", async (t) => {
  const identityRepo = new MemoryRepo();
  const mfaRepo = new MemoryMfaRepository();
  const server = buildServer({ logger: false, repository: identityRepo, mfaRepository: mfaRepo });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetToken(server);

  const setup = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/setup",
    headers: { authorization: `Bearer ${token}` }
  });
  const secret = setup.json().secret as string;
  await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify-setup",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { code: generateTotpCode(secret) }
  });

  identityRepo.setMfaEnabled(userId);

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: { email: "mfa@example.com", password: "StrongPass1!" }
  });
  const mfaToken = login.json().mfaToken as string;

  // First use succeeds
  const first = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken, code: generateTotpCode(secret) }
  });
  assert.equal(first.statusCode, 200);

  // Second use fails (token consumed)
  const second = await server.inject({
    method: "POST",
    url: "/internal/auth/mfa/verify",
    payload: { mfaToken, code: generateTotpCode(secret) }
  });
  assert.equal(second.statusCode, 401);
});
