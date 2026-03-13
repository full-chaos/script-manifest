import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import {
  MfaVerifySetupRequestSchema,
  MfaDisableRequestSchema,
  MfaLoginVerifyRequestSchema,
  AuthSessionResponseSchema
} from "@script-manifest/contracts";
import type { MfaRepository } from "./mfa-repository.js";
import type { IdentityRepository } from "./repository.js";
import { verifyPassword } from "./repository.js";
import {
  generateSecret,
  generateOtpauthUrl,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode
} from "./totp.js";
import { readBearerToken } from "@script-manifest/service-utils";

// ── MFA login challenge helpers ───────────────────────────────────────
// Challenges are persisted to the database so they survive restarts and
// work correctly in multi-instance deployments.

/**
 * Create a temporary MFA challenge token for the login flow.
 * Valid for 5 minutes. Stores the token in the database via mfaRepo.
 */
export async function createMfaChallenge(mfaRepo: MfaRepository, userId: string): Promise<string> {
  const token = `mfa_${randomBytes(24).toString("hex")}`;
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await mfaRepo.storeMfaChallenge(token, userId, expiresAt);
  return token;
}

/**
 * Consume an MFA challenge token (one-time use).
 * Returns userId if valid, null otherwise.
 */
export async function consumeMfaChallenge(mfaRepo: MfaRepository, token: string): Promise<string | null> {
  return mfaRepo.consumeMfaChallenge(token);
}

// ── Route registration ────────────────────────────────────────────────

export function registerMfaRoutes(
  server: FastifyInstance,
  mfaRepo: MfaRepository,
  identityRepo: IdentityRepository
): void {
  // ── POST /internal/auth/mfa/setup ───────────────────────────────────
  // Generate TOTP secret and store as pending setup.
  server.post("/internal/auth/mfa/setup", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const userId = sessionData.user.id;
      const email = sessionData.user.email;

      // Check if MFA is already enabled
      const status = await mfaRepo.getMfaStatus(userId);
      if (status.enabled) {
        return reply.status(409).send({ error: "mfa_already_enabled" });
      }

      const secret = generateSecret();
      await mfaRepo.setupMfa(userId, secret);

      const otpauthUrl = generateOtpauthUrl(secret, email);

      return reply.send({
        secret,
        otpauthUrl,
        qrCodeDataUrl: otpauthUrl // Frontend will render QR from the URL
      });
    }
  });

  // ── POST /internal/auth/mfa/verify-setup ────────────────────────────
  // Verify the first TOTP code to activate MFA.
  server.post("/internal/auth/mfa/verify-setup", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const parsed = MfaVerifySetupRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const userId = sessionData.user.id;

      // Get pending secret
      const secret = await mfaRepo.getPendingSetup(userId);
      if (!secret) {
        return reply.status(400).send({ error: "no_pending_mfa_setup" });
      }

      // Verify the TOTP code
      if (!verifyTotpCode(secret, parsed.data.code)) {
        return reply.status(400).send({ error: "invalid_totp_code" });
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes(10);
      const hashedCodes = backupCodes.map((c) => hashBackupCode(c));

      // Enable MFA
      await mfaRepo.enableMfa(userId, hashedCodes);

      return reply.send({
        enabled: true,
        backupCodes
      });
    }
  });

  // ── POST /internal/auth/mfa/disable ─────────────────────────────────
  // Disable MFA (requires password + TOTP code).
  server.post("/internal/auth/mfa/disable", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const parsed = MfaDisableRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      const userId = sessionData.user.id;

      // Verify password
      const isPasswordValid = verifyPassword(
        parsed.data.password,
        sessionData.user.passwordHash,
        sessionData.user.passwordSalt
      );
      if (!isPasswordValid) {
        return reply.status(403).send({ error: "invalid_password" });
      }

      // Verify TOTP code
      const secret = await mfaRepo.getSecret(userId);
      if (!secret) {
        return reply.status(400).send({ error: "mfa_not_enabled" });
      }

      if (!verifyTotpCode(secret, parsed.data.code)) {
        return reply.status(400).send({ error: "invalid_totp_code" });
      }

      await mfaRepo.disableMfa(userId);

      return reply.send({ ok: true });
    }
  });

  // ── GET /internal/auth/mfa/status ───────────────────────────────────
  // Check if MFA is enabled for the current user.
  server.get("/internal/auth/mfa/status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const status = await mfaRepo.getMfaStatus(sessionData.user.id);

      return reply.send({
        mfaEnabled: status.enabled,
        enabledAt: status.enabledAt
      });
    }
  });

  // ── POST /internal/auth/mfa/verify ──────────────────────────────────
  // Verify TOTP during login (MFA challenge). No Bearer token required.
  server.post("/internal/auth/mfa/verify", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsed = MfaLoginVerifyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      // Consume the MFA challenge token
      const userId = await consumeMfaChallenge(mfaRepo, parsed.data.mfaToken);
      if (!userId) {
        return reply.status(401).send({ error: "invalid_or_expired_mfa_token" });
      }

      // Get the TOTP secret
      const secret = await mfaRepo.getSecret(userId);
      if (!secret) {
        return reply.status(400).send({ error: "mfa_not_configured" });
      }

      const code = parsed.data.code;
      let verified = false;

      // Try TOTP verification first (6-digit codes)
      if (/^\d{6}$/.test(code)) {
        verified = verifyTotpCode(secret, code);
      }

      // Try backup code if TOTP didn't match
      if (!verified) {
        const codeHash = hashBackupCode(code);
        verified = await mfaRepo.consumeBackupCode(userId, codeHash);
      }

      if (!verified) {
        return reply.status(401).send({ error: "invalid_mfa_code" });
      }

      // Create session (same as normal login flow)
      const session = await identityRepo.createSession(userId);
      const sessionData = await identityRepo.findUserBySessionToken(session.token);
      if (!sessionData) {
        return reply.status(500).send({ error: "session_creation_failed" });
      }

      // Create refresh token
      const refresh = await identityRepo.createRefreshToken(userId);

      const payload = AuthSessionResponseSchema.parse({
        token: session.token,
        refreshToken: refresh.refreshToken,
        expiresAt: session.expiresAt,
        user: {
          id: sessionData.user.id,
          email: sessionData.user.email,
          displayName: sessionData.user.displayName,
          role: sessionData.user.role
        }
      });

      return reply.send(payload);
    }
  });
}
