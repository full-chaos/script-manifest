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
import { MemorySuspensionRepository } from "./suspension-repository.js";
import { MemoryIpBlockRepository } from "./ip-block-repository.js";
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
      id,
      email,
      displayName: input.displayName,
      passwordSalt,
      passwordHash: hashPassword(input.password, passwordSalt),
      role: "writer",
      accountStatus: "active",
      failedLoginAttempts: 0,
      lockedUntil: null,
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
  async softDeleteUser(): Promise<void> { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────

const SERVICE_SECRET = "test-secret-for-ip-block-routes";

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
  const ipBlockRepo = new MemoryIpBlockRepository();
  const suspensionRepo = new MemorySuspensionRepository();
  const server = buildServer({
    logger: false,
    repository: new MemoryRepo(),
    adminRepository: adminRepo,
    suspensionRepository: suspensionRepo,
    ipBlockRepository: ipBlockRepo
  });

  return {
    server,
    adminRepo,
    ipBlockRepo,
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

test("GET /internal/admin/ip-blocks returns empty list", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/ip-blocks?page=1&limit=50",
      headers: adminHeaders("admin_1")
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { blocks: unknown[]; total: number };
    assert.equal(body.total, 0);
    assert.deepEqual(body.blocks, []);
  } finally {
    cleanup();
  }
});

test("GET /internal/admin/ip-blocks requires admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/ip-blocks?page=1&limit=50",
      headers: writerHeaders("user_1")
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});

test("POST /internal/admin/ip-blocks adds a block", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/ip-blocks",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { ipAddress: "192.168.1.100", reason: "Brute force attack" }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload) as { block: { id: string; ipAddress: string; reason: string } };
    assert.ok(body.block.id);
    assert.equal(body.block.ipAddress, "192.168.1.100");
    assert.equal(body.block.reason, "Brute force attack");
  } finally {
    cleanup();
  }
});

test("POST /internal/admin/ip-blocks with expiry", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/ip-blocks",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { ipAddress: "10.0.0.1", reason: "Temporary block", expiresInHours: 24 }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload) as { block: { expiresAt: string | null } };
    assert.ok(body.block.expiresAt);
  } finally {
    cleanup();
  }
});

test("POST /internal/admin/ip-blocks requires admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/ip-blocks",
      headers: { "content-type": "application/json", ...writerHeaders("user_1") },
      payload: { ipAddress: "192.168.1.1", reason: "test" }
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});

test("POST /internal/admin/ip-blocks validates payload", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "POST",
      url: "/internal/admin/ip-blocks",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { ipAddress: "", reason: "test" }
    });
    assert.equal(res.statusCode, 400);
  } finally {
    cleanup();
  }
});

test("DELETE /internal/admin/ip-blocks/:id removes a block", async () => {
  const { server, ipBlockRepo, cleanup } = createTestServer();
  try {
    const block = await ipBlockRepo.addBlock("192.168.1.1", "test", "admin_1");

    const res = await server.inject({
      method: "DELETE",
      url: `/internal/admin/ip-blocks/${block.id}`,
      headers: adminHeaders("admin_1")
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { ok: boolean };
    assert.equal(body.ok, true);
  } finally {
    cleanup();
  }
});

test("DELETE /internal/admin/ip-blocks/:id returns 404 for non-existent", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "DELETE",
      url: "/internal/admin/ip-blocks/ipb_nonexistent",
      headers: adminHeaders("admin_1")
    });

    assert.equal(res.statusCode, 404);
  } finally {
    cleanup();
  }
});

test("DELETE /internal/admin/ip-blocks/:id requires admin", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "DELETE",
      url: "/internal/admin/ip-blocks/ipb_123",
      headers: writerHeaders("user_1")
    });
    assert.equal(res.statusCode, 403);
  } finally {
    cleanup();
  }
});

test("GET /internal/admin/ip-blocks/check/:ip returns blocked status", async () => {
  const { server, ipBlockRepo, cleanup } = createTestServer();
  try {
    await ipBlockRepo.addBlock("192.168.1.1", "test", "admin_1");

    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/ip-blocks/check/192.168.1.1",
      headers: adminHeaders("admin_1")
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { blocked: boolean };
    assert.equal(body.blocked, true);
  } finally {
    cleanup();
  }
});

test("GET /internal/admin/ip-blocks/check/:ip returns not blocked", async () => {
  const { server, cleanup } = createTestServer();
  try {
    const res = await server.inject({
      method: "GET",
      url: "/internal/admin/ip-blocks/check/10.0.0.1",
      headers: adminHeaders("admin_1")
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload) as { blocked: boolean };
    assert.equal(body.blocked, false);
  } finally {
    cleanup();
  }
});

test("IP block creates audit log entry", async () => {
  const { server, adminRepo, cleanup } = createTestServer();
  try {
    await server.inject({
      method: "POST",
      url: "/internal/admin/ip-blocks",
      headers: { "content-type": "application/json", ...adminHeaders("admin_1") },
      payload: { ipAddress: "192.168.1.100", reason: "Abuse" }
    });

    const auditLog = await adminRepo.listAuditLogEntries({ page: 1, limit: 50 });
    assert.ok(auditLog.entries.some((e) => e.action === "add_ip_block"));
  } finally {
    cleanup();
  }
});

test("IP block removal creates audit log entry", async () => {
  const { server, adminRepo, ipBlockRepo, cleanup } = createTestServer();
  try {
    const block = await ipBlockRepo.addBlock("192.168.1.1", "test", "admin_1");

    await server.inject({
      method: "DELETE",
      url: `/internal/admin/ip-blocks/${block.id}`,
      headers: adminHeaders("admin_1")
    });

    const auditLog = await adminRepo.listAuditLogEntries({ page: 1, limit: 50 });
    assert.ok(auditLog.entries.some((e) => e.action === "remove_ip_block"));
  } finally {
    cleanup();
  }
});
