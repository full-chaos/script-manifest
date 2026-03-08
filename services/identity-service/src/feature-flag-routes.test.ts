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
import { BaseMemoryRepository, signServiceToken } from "@script-manifest/service-utils";
import { buildServer } from "./index.js";
import { hashPassword } from "./repository.js";
import { MemoryAdminRepository } from "./admin-repository.js";
import { MemoryFeatureFlagRepository } from "./feature-flag-repository.js";
import { createHash, randomUUID } from "node:crypto";

// ── Memory identity repo ─────────────────────────────────────────

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
      id, email,
      displayName: input.displayName,
      passwordSalt,
      passwordHash: hashPassword(input.password, passwordSalt),
      role: "writer",
      mfaEnabled: false
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
      token, userId,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    this.sessions.set(token, session);
    return session;
  }

  async findUserBySessionToken(token: string): Promise<{ user: IdentityUser; session: IdentitySession } | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    const user = this.users.get(session.userId);
    if (!user) return null;
    return { user, session };
  }

  async deleteSession(token: string): Promise<void> { this.sessions.delete(token); }
  async deleteUserSessions(userId: string): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(token);
    }
  }
  async saveOAuthState(state: string, record: OAuthStateRecord): Promise<void> { this.oauthStates.set(state, record); }
  async getAndDeleteOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const record = this.oauthStates.get(state);
    if (!record) return null;
    this.oauthStates.delete(state);
    return record;
  }
  async cleanExpiredOAuthState(): Promise<void> { /* noop */ }

  async createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const token = `rfr_${randomUUID()}`;
    const fid = familyId ?? `fam_${randomUUID()}`;
    this.refreshTokens.set(token, { userId, familyId: fid, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    return { refreshToken: token, familyId: fid, expiresAt: this.refreshTokens.get(token)!.expiresAt };
  }

  async rotateRefreshToken(rawToken: string): Promise<RefreshTokenRotateResult> {
    const entry = this.refreshTokens.get(rawToken);
    if (!entry) return { status: "invalid" };
    if (entry.usedAt) return { status: "reuse_detected", familyId: entry.familyId };
    if (entry.revokedAt) return { status: "invalid" };
    entry.usedAt = new Date().toISOString();
    const replacement = await this.createRefreshToken(entry.userId, entry.familyId);
    return { status: "rotated", userId: entry.userId, ...replacement };
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    for (const entry of this.refreshTokens.values()) { if (entry.familyId === familyId) entry.revokedAt = new Date().toISOString(); }
  }
  async revokeUserRefreshTokens(userId: string): Promise<void> {
    for (const entry of this.refreshTokens.values()) { if (entry.userId === userId) entry.revokedAt = new Date().toISOString(); }
  }

  async createEmailVerificationToken(userId: string): Promise<{ code: string }> {
    const code = "123456";
    this.emailVerifCodes.set(userId, { codeHash: createHash("sha256").update(code).digest("hex"), expiresAt: Date.now() + 15 * 60 * 1000 });
    return { code };
  }
  async verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const stored = this.emailVerifCodes.get(userId);
    if (!stored || Date.now() > stored.expiresAt) return false;
    const codeHash = createHash("sha256").update(code).digest("hex");
    if (codeHash !== stored.codeHash) return false;
    this.emailVerifCodes.delete(userId);
    return true;
  }
  async markEmailVerified(): Promise<void> { /* noop */ }
  async createPasswordResetToken(userId: string): Promise<{ token: string }> {
    const token = `reset_${randomUUID()}`;
    this.resetTokens.set(token, { userId, expiresAt: Date.now() + 60 * 60 * 1000 });
    return { token };
  }
  async consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
    const entry = this.resetTokens.get(token);
    if (!entry || entry.usedAt || Date.now() > entry.expiresAt) return null;
    entry.usedAt = new Date().toISOString();
    return { userId: entry.userId };
  }
  async updatePassword(): Promise<void> { /* noop */ }
  async softDeleteUser(): Promise<void> { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────

const SERVICE_SECRET = "test-secret-for-feature-flags";

function adminHeaders(userId: string): Record<string, string> {
  return {
    "x-auth-user-id": userId,
    "x-service-token": signServiceToken({ sub: userId, role: "admin" }, SERVICE_SECRET)
  };
}

function writerHeaders(userId: string): Record<string, string> {
  return {
    "x-auth-user-id": userId,
    "x-service-token": signServiceToken({ sub: userId, role: "writer" }, SERVICE_SECRET)
  };
}

function createTestServer() {
  const prevSecret = process.env.SERVICE_TOKEN_SECRET;
  process.env.SERVICE_TOKEN_SECRET = SERVICE_SECRET;

  const flagRepo = new MemoryFeatureFlagRepository();
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    adminRepository: new MemoryAdminRepository(),
    featureFlagRepository: flagRepo
  });

  return {
    server,
    flagRepo,
    cleanup: () => {
      if (prevSecret !== undefined) {
        process.env.SERVICE_TOKEN_SECRET = prevSecret;
      } else {
        delete process.env.SERVICE_TOKEN_SECRET;
      }
    }
  };
}

// ── Tests ────────────────────────────────────────────────────────

test("list flags requires admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/feature-flags",
      headers: writerHeaders("user_1")
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});

test("list flags returns empty list", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/feature-flags",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { flags: unknown[] };
    assert.deepEqual(body.flags, []);
  } finally {
    cleanup();
  }
});

test("create flag succeeds", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "test_feature", description: "A test feature" }
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload) as { flag: { key: string; enabled: boolean } };
    assert.equal(body.flag.key, "test_feature");
    assert.equal(body.flag.enabled, false);
  } finally {
    cleanup();
  }
});

test("create flag validates key format", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "Invalid-Key!", description: "Bad" }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    cleanup();
  }
});

test("create duplicate flag returns 409", async () => {
  const { server, cleanup } = createTestServer();
  try {
    await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "dup_flag", description: "First" }
    });

    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "dup_flag", description: "Duplicate" }
    });
    assert.equal(res.statusCode, 409);
  } finally {
    cleanup();
  }
});

test("update flag succeeds", async () => {
  const { server, cleanup } = createTestServer();
  try {
    await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "update_me", description: "Original" }
    });

    const res = await server.inject({
      method: "PUT",
      url: "/internal/admin/feature-flags/update_me",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { enabled: true, rolloutPct: 75 }
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { flag: { enabled: boolean; rolloutPct: number } };
    assert.equal(body.flag.enabled, true);
    assert.equal(body.flag.rolloutPct, 75);
  } finally {
    cleanup();
  }
});

test("update nonexistent flag returns 404", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "PUT",
      url: "/internal/admin/feature-flags/nonexistent",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { enabled: true }
    });
    assert.equal(res.statusCode, 404);
  } finally {
    cleanup();
  }
});

test("delete flag succeeds", async () => {
  const { server, cleanup } = createTestServer();
  try {
    await server.inject({
      method: "POST",
      url: "/internal/admin/feature-flags",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { key: "delete_me", description: "To delete" }
    });

    const res = await server.inject({
      method: "DELETE",
      url: "/internal/admin/feature-flags/delete_me",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 204);

    // Verify deleted
    const listRes = await server.inject({
      method: "GET",
      url: "/internal/admin/feature-flags",
      headers: adminHeaders("admin_1")
    });
    const body = JSON.parse(listRes.payload) as { flags: unknown[] };
    assert.equal(body.flags.length, 0);
  } finally {
    cleanup();
  }
});

test("delete nonexistent flag returns 404", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "DELETE",
      url: "/internal/admin/feature-flags/nonexistent",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 404);
  } finally {
    cleanup();
  }
});

test("client evaluate flags returns evaluated results", async () => {
  const { server, flagRepo, cleanup } = createTestServer();
  try {
    await flagRepo.createFlag("enabled_flag", "Enabled", "admin_1");
    await flagRepo.updateFlag("enabled_flag", { enabled: true, rolloutPct: 100 }, "admin_1");

    await flagRepo.createFlag("disabled_flag", "Disabled", "admin_1");

    const res = await server.inject({
      method: "GET",
      url: "/internal/feature-flags",
      headers: { "x-auth-user-id": "user_1" }
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { flags: Record<string, boolean> };
    assert.equal(body.flags.enabled_flag, true);
    assert.equal(body.flags.disabled_flag, false);
  } finally {
    cleanup();
  }
});

test("client evaluate flags works without userId", async () => {
  const { server, flagRepo, cleanup } = createTestServer();
  try {
    await flagRepo.createFlag("full_flag", "Full", "admin_1");
    await flagRepo.updateFlag("full_flag", { enabled: true, rolloutPct: 100 }, "admin_1");

    const res = await server.inject({
      method: "GET",
      url: "/internal/feature-flags"
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { flags: Record<string, boolean> };
    assert.equal(body.flags.full_flag, true);
  } finally {
    cleanup();
  }
});
