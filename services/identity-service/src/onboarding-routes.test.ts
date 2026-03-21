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
import { MemoryOnboardingRepository } from "./onboarding-repository.js";
import { randomUUID } from "node:crypto";

class MemoryRepo extends BaseMemoryRepository implements IdentityRepository {
  private users = new Map<string, IdentityUser>();
  private usersByEmail = new Map<string, string>();
  private sessions = new Map<string, IdentitySession>();
  private oauthStates = new Map<string, OAuthStateRecord>();
  private refreshTokens = new Map<string, {
    userId: string;
    familyId: string;
    expiresAt: string;
    usedAt?: string;
    revokedAt?: string;
  }>();

  private makeId(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  override async init(): Promise<void> {}

  override async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const email = input.email.toLowerCase();
    if (this.usersByEmail.has(email)) return null;

    const id = this.makeId("user");
    const passwordSalt = this.makeId("salt");
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
    const token = this.makeId("sess");
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

  async markEmailVerified(userId: string): Promise<void> {
    this.setEmailVerified(userId, true);
  }

  async createPasswordResetToken(_userId: string): Promise<{ token: string }> {
    return { token: "reset_token" };
  }

  async consumePasswordResetToken(_token: string): Promise<{ userId: string } | null> {
    return null;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const salt = this.makeId("salt");
      user.passwordSalt = salt;
      user.passwordHash = hashPassword(password, salt);
    }
  }

  async softDeleteUser(userId: string): Promise<void> {
    await this.deleteUserSessions(userId);
  }

  async createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const token = this.makeId("rfr");
    const finalFamilyId = familyId ?? this.makeId("fam");
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

  setEmailVerified(userId: string, verified: boolean): void {
    const user = this.users.get(userId);
    if (user) {
      user.emailVerified = verified;
    }
  }
}

async function registerAndGetSession(
  server: ReturnType<typeof buildServer>,
  email = "onboarding@example.com",
  password = "StrongPass1!"
) {
  const res = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: { email, password, displayName: "Onboarding User", acceptTerms: true }
  });
  assert.equal(res.statusCode, 201, `Registration failed: ${res.body}`);
  const payload = res.json();
  return { token: payload.token as string, userId: payload.user.id as string };
}

test("GET /internal/onboarding/status returns all false for new user", async (t: { after(fn: () => Promise<void>): void }) => {
  const identityRepo = new MemoryRepo();
  const server = buildServer({
    logger: false,
    repository: identityRepo,
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetSession(server);

  const res = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    status: {
      emailVerified: false,
      profileCompleted: false,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false
    }
  });
});

test("GET /internal/onboarding/status returns 401 without auth", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status"
  });

  assert.equal(res.statusCode, 401);
});

test("PATCH /internal/onboarding/progress marks single step complete", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetSession(server);

  const patch = await server.inject({
    method: "PATCH",
    url: "/internal/onboarding/progress",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { profileCompleted: true }
  });

  assert.equal(patch.statusCode, 200);
  assert.deepEqual(patch.json(), { ok: true });

  const get = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(get.statusCode, 200);
  assert.equal(get.json().status.profileCompleted, true);
  assert.equal(get.json().status.firstScriptUploaded, false);
  assert.equal(get.json().status.competitionsVisited, false);
  assert.equal(get.json().status.coverageVisited, false);
});

test("PATCH /internal/onboarding/progress marks multiple steps complete", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetSession(server);

  const patch = await server.inject({
    method: "PATCH",
    url: "/internal/onboarding/progress",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { firstScriptUploaded: true, competitionsVisited: true, coverageVisited: true }
  });

  assert.equal(patch.statusCode, 200);

  const get = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(get.statusCode, 200);
  assert.equal(get.json().status.profileCompleted, false);
  assert.equal(get.json().status.firstScriptUploaded, true);
  assert.equal(get.json().status.competitionsVisited, true);
  assert.equal(get.json().status.coverageVisited, true);
});

test("PATCH /internal/onboarding/progress returns 401 without auth", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const res = await server.inject({
    method: "PATCH",
    url: "/internal/onboarding/progress",
    headers: { "content-type": "application/json" },
    payload: { profileCompleted: true }
  });

  assert.equal(res.statusCode, 401);
});

test("PATCH /internal/onboarding/progress ignores invalid fields", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetSession(server);

  const patch = await server.inject({
    method: "PATCH",
    url: "/internal/onboarding/progress",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: {
      profileCompleted: true,
      unknownField: true
    }
  });

  assert.equal(patch.statusCode, 200);

  const get = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(get.statusCode, 200);
  assert.equal(get.json().status.profileCompleted, true);
  assert.equal(get.json().status.firstScriptUploaded, false);
  assert.equal(get.json().status.competitionsVisited, false);
  assert.equal(get.json().status.coverageVisited, false);
});

test("GET after PATCH reflects updated state", async (t: { after(fn: () => Promise<void>): void }) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token } = await registerAndGetSession(server);

  await server.inject({
    method: "PATCH",
    url: "/internal/onboarding/progress",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { profileCompleted: true, competitionsVisited: true }
  });

  const get = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(get.statusCode, 200);
  assert.deepEqual(get.json().status, {
    emailVerified: false,
    profileCompleted: true,
    firstScriptUploaded: false,
    competitionsVisited: true,
    coverageVisited: false
  });
});

test("GET /internal/onboarding/status returns actual emailVerified state", async (t: { after(fn: () => Promise<void>): void }) => {
  const identityRepo = new MemoryRepo();
  const server = buildServer({
    logger: false,
    repository: identityRepo,
    onboardingRepository: new MemoryOnboardingRepository()
  });
  t.after(async () => { await server.close(); });

  const { token, userId } = await registerAndGetSession(server, "verified@example.com");
  identityRepo.setEmailVerified(userId, true);

  const get = await server.inject({
    method: "GET",
    url: "/internal/onboarding/status",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(get.statusCode, 200);
  assert.equal(get.json().status.emailVerified, true);
});
