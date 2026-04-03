import { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request } from "undici";
import { Counter } from "prom-client";
import { createFastifyServer, validateRequiredEnv, bootstrapService, setupErrorReporting, isMainModule, readBearerToken } from "@script-manifest/service-utils";
import { healthCheck } from "@script-manifest/db";
import {
  AuthLoginRequestSchema,
  AuthMeResponseSchema,
  AuthRegisterRequestSchema,
  AuthSessionResponseSchema,
  DeleteAccountRequestSchema,
  EmailVerificationRequestSchema,
  ForgotPasswordRequestSchema,
  OAuthCompleteRequestSchema,
  OAuthProviderSchema,
  OAuthStartRequestSchema,
  OAuthStartResponseSchema,
  ResetPasswordRequestSchema,
  UnlockAccountRequestSchema,
  type OAuthProvider
} from "@script-manifest/contracts";
import {
  type IdentityRepository,
  type IdentityUser,
  PgIdentityRepository,
  verifyPassword
} from "./repository.js";
import { type AdminRepository, PgAdminRepository, MemoryAdminRepository } from "./admin-repository.js";
import { registerAdminRoutes } from "./admin-routes.js";
import { type SuspensionRepository, PgSuspensionRepository, MemorySuspensionRepository } from "./suspension-repository.js";
import { registerSuspensionRoutes } from "./suspension-routes.js";
import { type IpBlockRepository, PgIpBlockRepository, MemoryIpBlockRepository } from "./ip-block-repository.js";
import { registerIpBlockRoutes } from "./ip-block-routes.js";
import { type FeatureFlagRepository, PgFeatureFlagRepository, MemoryFeatureFlagRepository } from "./feature-flag-repository.js";
import { registerFeatureFlagRoutes } from "./feature-flag-routes.js";
import { type MfaRepository, PgMfaRepository, MemoryMfaRepository } from "./mfa-repository.js";
import { registerMfaRoutes, createMfaChallenge } from "./mfa-routes.js";
import { type OnboardingRepository, PgOnboardingRepository, MemoryOnboardingRepository } from "./onboarding-repository.js";
import { registerOnboardingRoutes } from "./onboarding-routes.js";
import type { EmailService } from "@script-manifest/email";
import { registerMetrics, registerSentryErrorHandler } from "@script-manifest/service-utils";

const loginCounter = new Counter({
  name: "identity_logins_total",
  help: "Total number of successful logins",
  labelNames: ["method"] as const,
});

// Dummy credentials for constant-time verification when user doesn't exist
const DUMMY_SALT = "0000000000000000000000000000000000000000000000000000000000000000";
const DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export type IdentityServiceOptions = {
  logger?: boolean;
  repository?: IdentityRepository;
  adminRepository?: AdminRepository;
  suspensionRepository?: SuspensionRepository;
  ipBlockRepository?: IpBlockRepository;
  featureFlagRepository?: FeatureFlagRepository;
  mfaRepository?: MfaRepository;
  onboardingRepository?: OnboardingRepository;
  emailService?: EmailService;
};

// lgtm [js/missing-rate-limiting]
export function buildServer(options: IdentityServiceOptions = {}): FastifyInstance {
  const repository = options.repository ?? new PgIdentityRepository();
  // Use MemoryAdminRepository when a custom repository is provided (tests)
  const adminRepo = options.adminRepository ?? (options.repository ? new MemoryAdminRepository() : new PgAdminRepository());
  const suspensionRepo = options.suspensionRepository ?? (options.repository ? new MemorySuspensionRepository() : new PgSuspensionRepository());
  const ipBlockRepo = options.ipBlockRepository ?? (options.repository ? new MemoryIpBlockRepository() : new PgIpBlockRepository());
  const flagRepo = options.featureFlagRepository ?? (options.repository ? new MemoryFeatureFlagRepository() : new PgFeatureFlagRepository());
  const mfaRepo = options.mfaRepository ?? (options.repository ? new MemoryMfaRepository() : new PgMfaRepository());
  const onboardingRepo = options.onboardingRepository ?? (options.repository ? new MemoryOnboardingRepository() : new PgOnboardingRepository());
  const emailService = options.emailService;
  const runHealthCheck = options.repository ? () => repository.healthCheck() : healthCheck;
  const server = createFastifyServer({ logger: options.logger });
  const oauthIssuerBase =
    process.env.IDENTITY_SERVICE_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "4005"}`;
  const googleRedirectUriDefault = process.env.GOOGLE_REDIRECT_URI ?? "";

  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const useRealGoogle = Boolean(googleClientId && googleClientSecret);

  server.addHook("onReady", async () => {
    await repository.init();
    await adminRepo.init();
    await suspensionRepo.init();
    await ipBlockRepo.init();
    await flagRepo.init();
    await mfaRepo.init();
    await onboardingRepo.init();
  });

  server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    allowList: []
  });
  server.register(cookie);

  server.get("/health", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      const checks: Record<string, boolean> = {};
      try {
        const result = await runHealthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "identity-service", ok, checks });
    }
  });

  server.get("/health/live", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async () => ({ ok: true })
  });

  server.get("/health/ready", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      const checks: Record<string, boolean> = {};
      try {
        const result = await runHealthCheck();
        checks.database = result.database;
      } catch {
        checks.database = false;
      }
      const ok = Object.values(checks).every(Boolean);
      return reply.status(ok ? 200 : 503).send({ service: "identity-service", ok, checks });
    }
  });

  server.post("/internal/auth/register", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const parsedBody = AuthRegisterRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const user = await repository.registerUser({
      email: parsedBody.data.email,
      password: parsedBody.data.password,
      displayName: parsedBody.data.displayName,
      acceptTerms: parsedBody.data.acceptTerms,
    });
    if (!user) {
      return reply.status(409).send({ error: "email_already_registered" });
    }

    const payload = await createAuthSessionPayload(repository, user);

      // Send verification email if email service is available
      if (emailService) {
        const { code } = await repository.createEmailVerificationToken(user.id);
        await emailService.sendEmail({
          to: user.email,
          template: "verification-code",
          data: { code, displayName: user.displayName },
        });
      }

      return reply.status(201).send(payload);
    }
  });

  server.post("/internal/auth/verify-email", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsedBody = EmailVerificationRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await repository.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const valid = await repository.verifyEmailCode(sessionData.user.id, parsedBody.data.code);
      if (!valid) {
        return reply.status(400).send({ error: "invalid_or_expired_code" });
      }

      await repository.markEmailVerified(sessionData.user.id);

      // Send welcome email
      if (emailService) {
        await emailService.sendEmail({
          to: sessionData.user.email,
          template: "welcome",
          data: { displayName: sessionData.user.displayName },
        });
      }

      return reply.send({ ok: true });
    }
  });

  server.post("/internal/auth/resend-verification", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await repository.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      if (emailService) {
        const { code } = await repository.createEmailVerificationToken(sessionData.user.id);
        await emailService.sendEmail({
          to: sessionData.user.email,
          template: "verification-code",
          data: { code, displayName: sessionData.user.displayName },
        });
      }

      return reply.send({ ok: true });
    }
  });

  server.post("/internal/auth/forgot-password", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsedBody = ForgotPasswordRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      // Always return success to prevent email enumeration
      const user = await repository.findUserByEmail(parsedBody.data.email);
      if (user && emailService) {
        const { token: resetToken } = await repository.createPasswordResetToken(user.id);
        const resetBase = process.env.FRONTEND_URL ?? "http://localhost:3000";
        const resetUrl = `${resetBase}/reset-password?token=${encodeURIComponent(resetToken)}`;
        await emailService.sendEmail({
          to: user.email,
          template: "password-reset",
          data: { resetUrl, displayName: user.displayName },
        });
      }

      return reply.send({ ok: true });
    }
  });

  server.post("/internal/auth/reset-password", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsedBody = ResetPasswordRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      const result = await repository.consumePasswordResetToken(parsedBody.data.token);
      if (!result) {
        return reply.status(400).send({ error: "invalid_or_expired_token" });
      }

      await repository.updatePassword(result.userId, parsedBody.data.password);

      // Invalidate all sessions and refresh tokens
      await repository.deleteUserSessions(result.userId);
      if (repository.revokeUserRefreshTokens) {
        await repository.revokeUserRefreshTokens(result.userId);
      }

      return reply.send({ ok: true });
    }
  });

  server.post("/internal/auth/unlock-account", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsedBody = UnlockAccountRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      if (!repository.consumeAccountUnlockToken || !repository.resetLoginLockout) {
        return reply.status(501).send({ error: "unlock_not_supported" });
      }

      const result = await repository.consumeAccountUnlockToken(parsedBody.data.token);
      if (!result) {
        return reply.status(400).send({ error: "invalid_or_expired_token" });
      }

      await repository.resetLoginLockout(result.userId);
      return reply.send({ ok: true });
    }
  });

  server.delete("/internal/auth/account", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const parsedBody = DeleteAccountRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await repository.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      // Verify password before deletion
      const isValid = verifyPassword(
        parsedBody.data.password,
        sessionData.user.passwordHash,
        sessionData.user.passwordSalt
      );
      if (!isValid) {
        return reply.status(403).send({ error: "invalid_password" });
      }

      await repository.softDeleteUser(sessionData.user.id);

      return reply.send({ ok: true });
    }
  });

  server.post("/internal/auth/login", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const parsedBody = AuthLoginRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const user = await repository.findUserByEmail(parsedBody.data.email);

    if (!user) {
      verifyPassword(parsedBody.data.password, DUMMY_HASH, DUMMY_SALT);
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const accountStatus = user.accountStatus ?? "active";
    const failedLoginAttempts = user.failedLoginAttempts ?? 0;
    const lockedUntil = user.lockedUntil ?? null;
    const mfaEnabled = user.mfaEnabled ?? false;

    // Check account status before creating session
    if (accountStatus === "banned") {
      return reply.status(403).send({ error: "account_banned" });
    }
    if (accountStatus === "suspended") {
      const activeSuspension = await suspensionRepo.getActiveSuspension(user.id);
      return reply.status(403).send({
        error: "account_suspended",
        expiresAt: activeSuspension?.expiresAt ?? null
      });
    }

    if (accountStatus !== "active") {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const isTemporarilyLocked = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
    const isPermanentlyLocked = failedLoginAttempts >= 15;
    if (isTemporarilyLocked || isPermanentlyLocked) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const isValid = verifyPassword(parsedBody.data.password, user.passwordHash, user.passwordSalt);

    if (!isValid) {
      const lockoutState = repository.recordFailedLoginAttempt
        ? await repository.recordFailedLoginAttempt(user.id)
        : null;

      if (lockoutState?.failedLoginAttempts === 15 && emailService && repository.createAccountUnlockToken) {
        const { token: unlockToken } = await repository.createAccountUnlockToken(user.id);
        const resetBase = process.env.FRONTEND_URL ?? "http://localhost:3000";
        const unlockUrl = `${resetBase}/unlock-account?token=${encodeURIComponent(unlockToken)}`;

        await emailService.sendEmail({
          to: user.email,
          template: "account-lockout",
          data: {
            displayName: user.displayName,
            lockDuration: "until manually unlocked",
            unlockUrl,
          },
        });
      }

      return reply.status(401).send({ error: "invalid_credentials" });
    }

    if (repository.resetLoginLockout) {
      await repository.resetLoginLockout(user.id);
    }

    // Check if user has MFA enabled
    if (mfaEnabled) {
      const mfaToken = await createMfaChallenge(mfaRepo, user.id);
      return reply.send({ requiresMfa: true, mfaToken });
    }
    const payload = await createAuthSessionPayload(repository, user);

      loginCounter.inc({ method: "password" });
      return reply.send(payload);
    }
  });

  server.post("/internal/auth/oauth/:provider/start", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const provider = parseProvider(req.params);
    if (!provider) {
      return reply.status(400).send({ error: "unsupported_provider" });
    }

    const parsedBody = OAuthStartRequestSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const state = createOpaqueToken();
    const { codeVerifier, codeChallenge } = generatePKCE();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const requestedRedirectUri = parsedBody.data.redirectUri || undefined;
    const defaultCallbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase).toString();
    const oauthRedirectUri = requestedRedirectUri ?? (googleRedirectUriDefault || defaultCallbackUrl);

    if (useRealGoogle && provider === "google") {
      // Real Google OAuth flow
      await repository.saveOAuthState(state, {
        codeVerifier,
        provider,
        redirectUri: oauthRedirectUri,
        expiresAt
      });

      const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizationUrl.searchParams.set("client_id", googleClientId);
      authorizationUrl.searchParams.set("redirect_uri", oauthRedirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", "openid email profile");
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("access_type", "offline");

      const payload = OAuthStartResponseSchema.parse({
        provider,
        state,
        callbackUrl: oauthRedirectUri,
        authorizationUrl: authorizationUrl.toString(),
        codeChallenge,
        expiresAt
      });

      return reply.status(201).send(payload);
    }

    // Mock OAuth flow (local dev)
    const identity = toOAuthIdentity(provider, parsedBody.data.loginHint);
    const mockCode = createOpaqueToken();

    await repository.saveOAuthState(state, {
      codeVerifier,
      provider,
      redirectUri: requestedRedirectUri,
      mockEmail: identity.email,
      mockDisplayName: identity.displayName,
      mockCode,
      expiresAt
    });

    const callbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase);
    const authorizationUrl = new URL(callbackUrl.toString());
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("code", mockCode);
    if (parsedBody.data.redirectUri) {
      authorizationUrl.searchParams.set("redirect_uri", parsedBody.data.redirectUri);
    }

    const payload = OAuthStartResponseSchema.parse({
      provider,
      state,
      callbackUrl: callbackUrl.toString(),
      authorizationUrl: authorizationUrl.toString(),
      mockCode,
      codeChallenge,
      expiresAt
    });

      return reply.status(201).send(payload);
    }
  });

  server.post("/internal/auth/oauth/:provider/complete", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const provider = parseProvider(req.params);
    if (!provider) {
      return reply.status(400).send({ error: "unsupported_provider" });
    }

    const parsedBody = OAuthCompleteRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const completeCallbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase).toString();
    const result = await completeOAuthSession(repository, provider, parsedBody.data, useRealGoogle, googleClientId, googleClientSecret, completeCallbackUrl);
    if ("error" in result) {
      return reply.status(result.statusCode).send({ error: result.error });
    }

      return reply.send(result.payload);
    }
  });

  server.get("/internal/auth/oauth/:provider/callback", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const provider = parseProvider(req.params);
    if (!provider) {
      return reply.status(400).send({ error: "unsupported_provider" });
    }

    const parsedQuery = OAuthCompleteRequestSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const getCallbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase).toString();
    const result = await completeOAuthSession(repository, provider, parsedQuery.data, useRealGoogle, googleClientId, googleClientSecret, getCallbackUrl);
    if ("error" in result) {
      return reply.status(result.statusCode).send({ error: result.error });
    }

      return reply.send(result.payload);
    }
  });

  server.get("/internal/auth/me", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    const data = await repository.findUserBySessionToken(token);
    if (!data) {
      return reply.status(401).send({ error: "invalid_session" });
    }

    const payload = AuthMeResponseSchema.parse({
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.displayName,
        role: data.user.role,
        emailVerified: data.user.emailVerified
      },
      expiresAt: data.session.expiresAt
    });

      return reply.send(payload);
    }
  });

  server.post("/internal/auth/logout", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

      const sessionData = await repository.findUserBySessionToken(token);
      if (sessionData && repository.revokeUserRefreshTokens) {
        await repository.revokeUserRefreshTokens(sessionData.user.id);
      }
      await repository.deleteSession(token);
      return reply.status(204).send();
    }
  });

  server.post("/internal/auth/refresh", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const rawToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
      if (typeof rawToken !== "string" || rawToken.length === 0) {
        return reply.status(400).send({ error: "invalid_payload" });
      }

      const rotated = await repository.rotateRefreshToken(rawToken);
      if (rotated.status === "reuse_detected") {
        await repository.revokeTokenFamily(rotated.familyId);
        return reply.status(401).send({ error: "refresh_token_reuse_detected" });
      }

      if (rotated.status === "invalid") {
        return reply.status(401).send({ error: "invalid_refresh_token" });
      }

      const session = await repository.createSession(rotated.userId);
      const sessionData = await repository.findUserBySessionToken(session.token);
      if (!sessionData) {
        return reply.status(500).send({ error: "session_creation_failed" });
      }

      const payload = AuthSessionResponseSchema.parse({
        token: session.token,
        refreshToken: rotated.refreshToken,
        expiresAt: session.expiresAt,
        user: {
          id: sessionData.user.id,
          email: sessionData.user.email,
          displayName: sessionData.user.displayName,
          role: sessionData.user.role,
          emailVerified: sessionData.user.emailVerified
        }
      });

      return reply.send(payload);
    }
  });

  registerMfaRoutes(server, mfaRepo, repository);
  registerOnboardingRoutes(server, onboardingRepo, repository);
  registerAdminRoutes(server, adminRepo);
  registerSuspensionRoutes(server, suspensionRepo, adminRepo);
  registerIpBlockRoutes(server, ipBlockRepo, adminRepo);
  registerFeatureFlagRoutes(server, flagRepo, adminRepo);

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("identity-service");
  setupErrorReporting("identity-service");
  

  validateRequiredEnv(["DATABASE_URL", "MFA_ENCRYPTION_KEY"]);
  boot.phase("env validated");

  const { createEmailService } = await import("@script-manifest/email");
  const emailService = await createEmailService();
  boot.phase(emailService ? "email service ready" : "email service not configured (skipping)");

  const port = Number(process.env.PORT ?? 4005);
  const server = buildServer({ emailService });
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  registerSentryErrorHandler(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

function createOpaqueToken(): string {
  return randomBytes(24).toString("hex");
}

// PKCE helpers
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // 43-128 URL-safe characters
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function toOAuthIdentity(provider: OAuthProvider, loginHint: string | undefined): {
  email: string;
  displayName: string;
} {
  const slug = (loginHint ?? "writer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "writer";
  const displayBase = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
  const displayName = `${displayBase || "Writer"} (${provider})`;
  const email = `${provider}+${slug}@oauth.local`;
  return { email, displayName };
}

function parseProvider(params: unknown): OAuthProvider | null {
  const providerValue = (params as { provider?: unknown })?.provider;
  const parsedProvider = OAuthProviderSchema.safeParse(providerValue);
  if (!parsedProvider.success) {
    return null;
  }

  return parsedProvider.data;
}

// Exchange a Google authorization code for user info via the Google OAuth2 API
async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ email: string; displayName: string } | { error: string }> {
  // Exchange code for access token
  const tokenResponse = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    })
  });

  const tokenBody = await tokenResponse.body.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenBody.access_token) {
    return { error: tokenBody.error_description ?? tokenBody.error ?? "google_token_exchange_failed" };
  }

  const accessToken = tokenBody.access_token;

  // Fetch user profile from Google
  const userResponse = await request("https://www.googleapis.com/oauth2/v2/userinfo", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    }
  });

  const userBody = await userResponse.body.json() as {
    email?: string;
    verified_email?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
  };

  if (!userBody.email || !userBody.verified_email) {
    return { error: "google_no_verified_email" };
  }

  const displayName = userBody.name || userBody.email.split("@")[0] || "Google User";

  return { email: userBody.email, displayName };
}

async function completeOAuthSession(
  repository: IdentityRepository,
  provider: OAuthProvider,
  input: { state: string; code: string },
  useRealGoogle: boolean,
  googleClientId: string,
  googleClientSecret: string,
  fallbackCallbackUrl: string
): Promise<
  | { payload: ReturnType<typeof AuthSessionResponseSchema.parse> }
  | { error: string; statusCode: number }
> {
  const stored = await repository.getAndDeleteOAuthState(input.state);
  if (!stored) {
    return { error: "invalid_oauth_state", statusCode: 400 };
  }

  if (stored.expiresAt < new Date().toISOString()) {
    return { error: "oauth_state_expired", statusCode: 400 };
  }

  if (stored.provider !== provider) {
    return { error: "oauth_provider_mismatch", statusCode: 400 };
  }
  const redirectUri = stored.redirectUri || fallbackCallbackUrl;

  let email: string;
  let displayName: string;

  if (useRealGoogle && provider === "google") {
    // Real Google: exchange authorization code for user info
    const googleResult = await exchangeGoogleCode(input.code, googleClientId, googleClientSecret, redirectUri, stored.codeVerifier);
    if ("error" in googleResult) {
      return { error: googleResult.error, statusCode: 400 };
    }
    email = googleResult.email;
    displayName = googleResult.displayName;
  } else {
    // Mock flow: validate mock code
    if (!stored.mockCode || stored.mockCode !== input.code) {
      return { error: "invalid_oauth_code", statusCode: 400 };
    }
    email = stored.mockEmail ?? "";
    displayName = stored.mockDisplayName ?? "";
    if (!email) {
      return { error: "oauth_user_provision_failed", statusCode: 500 };
    }
  }

  let user = await repository.findUserByEmail(email);
  if (!user) {
    user = await repository.registerUser({
      email,
      displayName,
      password: `oauth-${provider}-${randomUUID()}-${createOpaqueToken()}`
    });
  }
  if (!user) {
    user = await repository.findUserByEmail(email);
  }
  if (!user) {
    return { error: "oauth_user_provision_failed", statusCode: 500 };
  }

  const payload = await createAuthSessionPayload(repository, user);

  loginCounter.inc({ method: provider });
  return { payload };
}

async function createAuthSessionPayload(
  repository: IdentityRepository,
  user: IdentityUser,
): Promise<ReturnType<typeof AuthSessionResponseSchema.parse>> {
  const session = await repository.createSession(user.id);
  const refresh = await repository.createRefreshToken(user.id);

  return AuthSessionResponseSchema.parse({
    token: session.token,
    refreshToken: refresh.refreshToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified
    }
  });
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
