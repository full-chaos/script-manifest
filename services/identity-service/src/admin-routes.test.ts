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
import { createHash, randomUUID } from "node:crypto";

// ── Memory identity repo (same as index.test.ts) ────────────────

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

  async saveOAuthState(state: string, record: OAuthStateRecord): Promise<void> {
    this.oauthStates.set(state, record);
  }

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
    this.refreshTokens.set(token, {
      userId,
      familyId: fid,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
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
    for (const entry of this.refreshTokens.values()) {
      if (entry.familyId === familyId) entry.revokedAt = new Date().toISOString();
    }
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    for (const entry of this.refreshTokens.values()) {
      if (entry.userId === userId) entry.revokedAt = new Date().toISOString();
    }
  }

  async createEmailVerificationToken(userId: string): Promise<{ code: string }> {
    const code = "123456";
    this.emailVerifCodes.set(userId, {
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt: Date.now() + 15 * 60 * 1000
    });
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

    return { failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil };
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
    const token = `aut_${randomUUID()}`;
    this.unlockTokens.set(token, { userId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return { token };
  }

  async consumeAccountUnlockToken(token: string): Promise<{ userId: string } | null> {
    const entry = this.unlockTokens.get(token);
    if (!entry || entry.usedAt || Date.now() > entry.expiresAt) {
      return null;
    }
    entry.usedAt = new Date().toISOString();
    return { userId: entry.userId };
  }
  async softDeleteUser(): Promise<void> { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────

const SERVICE_SECRET = "test-secret-for-admin-routes";

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

  const adminRepo = new MemoryAdminRepository();
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    adminRepository: adminRepo
  });

  return {
    server,
    adminRepo,
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

test("admin user list returns 403 for non-admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/users",
      headers: writerHeaders("user_1")
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});

test("admin user list returns empty list", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/users?page=1&limit=20",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { users: unknown[]; total: number };
    assert.equal(body.total, 0);
    assert.deepEqual(body.users, []);
  } finally {
    cleanup();
  }
});

test("admin audit log returns entries", async () => {
  const { server, adminRepo, cleanup } = createTestServer();
  try {
    await adminRepo.createAuditLogEntry({
      adminUserId: "admin_1",
      action: "test_action",
      targetType: "user",
      targetId: "user_99"
    });

    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/audit-log?page=1&limit=50",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { entries: unknown[]; total: number };
    assert.equal(body.total, 1);
    assert.equal(body.entries.length, 1);
  } finally {
    cleanup();
  }
});

test("content report creation requires auth", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/reports",
      headers: { "content-type": "application/json" },
      payload: { contentType: "script", contentId: "s1", reason: "spam" }
    });
    assert.equal(res.statusCode, 401);
  } finally {
    cleanup();
  }
});

test("content report creation and moderation queue", async () => {
  const { server, cleanup } = createTestServer();
  try {
    // Create a report as a regular user
    const createRes = await server.inject({
      method: "POST",
      url: "/internal/reports",
      headers: { "content-type": "application/json", ...writerHeaders("user_1") },
      payload: { contentType: "script", contentId: "script_123", reason: "plagiarism", description: "Copied my work" }
    });
    assert.equal(createRes.statusCode, 201);
    const { report } = JSON.parse(createRes.payload) as { report: { id: string; status: string } };
    assert.equal(report.status, "pending");

    // Admin views the queue
    const queueRes = await server.inject({
      method: "GET",
      url: "/internal/admin/moderation/queue?page=1&limit=20",
      headers: adminHeaders("admin_1")
    });
    assert.equal(queueRes.statusCode, 200);
    const queue = JSON.parse(queueRes.payload) as { reports: { id: string }[]; total: number };
    assert.equal(queue.total, 1);
    assert.equal(queue.reports[0]?.id, report.id);

    // Admin takes action
    const actionRes = await server.inject({
      method: "POST",
      url: `/internal/admin/moderation/${report.id}/action`,
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { actionType: "warning", reason: "First offense warning" }
    });
    assert.equal(actionRes.statusCode, 200);
    const resolved = JSON.parse(actionRes.payload) as { report: { status: string } };
    assert.equal(resolved.report.status, "reviewed");
  } finally {
    cleanup();
  }
});

test("admin metrics endpoint returns data", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/metrics",
      headers: adminHeaders("admin_1")
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { metrics: { totalUsers: number; pendingReports: number } };
    assert.equal(typeof body.metrics.totalUsers, "number");
    assert.equal(typeof body.metrics.pendingReports, "number");
  } finally {
    cleanup();
  }
});

test("moderation queue returns 403 for non-admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/moderation/queue?page=1&limit=20",
      headers: writerHeaders("user_1")
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});
