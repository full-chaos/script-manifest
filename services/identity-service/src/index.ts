import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request } from "undici";
import { validateRequiredEnv, bootstrapService } from "@script-manifest/service-utils";
import {
  AuthLoginRequestSchema,
  AuthMeResponseSchema,
  AuthRegisterRequestSchema,
  AuthSessionResponseSchema,
  OAuthCompleteRequestSchema,
  OAuthProviderSchema,
  OAuthStartRequestSchema,
  OAuthStartResponseSchema,
  type OAuthProvider
} from "@script-manifest/contracts";
import {
  type IdentityRepository,
  PgIdentityRepository,
  verifyPassword
} from "./repository.js";
import { registerMetrics } from "@script-manifest/service-utils";

// Dummy credentials for constant-time verification when user doesn't exist
const DUMMY_SALT = "0000000000000000000000000000000000000000000000000000000000000000";
const DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export type IdentityServiceOptions = {
  logger?: boolean;
  repository?: IdentityRepository;
};

// lgtm [js/missing-rate-limiting]
export function buildServer(options: IdentityServiceOptions = {}): FastifyInstance {
  const repository = options.repository ?? new PgIdentityRepository();
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const oauthIssuerBase =
    process.env.IDENTITY_SERVICE_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "4005"}`;

  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const useRealGoogle = Boolean(googleClientId && googleClientSecret);

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    allowList: []
  });

  server.get("/health", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (_req, reply) => {
      const checks: Record<string, boolean> = {};
      try {
        const result = await repository.healthCheck();
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
        const result = await repository.healthCheck();
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

    const user = await repository.registerUser(parsedBody.data);
    if (!user) {
      return reply.status(409).send({ error: "email_already_registered" });
    }

    const session = await repository.createSession(user.id);
    const payload = AuthSessionResponseSchema.parse({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });

      return reply.status(201).send(payload);
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

    // Always run password verification to prevent timing attacks
    // Use dummy credentials if user doesn't exist
    const isValid = user
      ? verifyPassword(parsedBody.data.password, user.passwordHash, user.passwordSalt)
      : verifyPassword(parsedBody.data.password, DUMMY_HASH, DUMMY_SALT);

    if (!user || !isValid) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }

    const session = await repository.createSession(user.id);
    const payload = AuthSessionResponseSchema.parse({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });

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

    if (useRealGoogle && provider === "google") {
      // Real Google OAuth flow
      const callbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase);

      await repository.saveOAuthState(state, {
        codeVerifier,
        provider,
        redirectUri: parsedBody.data.redirectUri || undefined,
        expiresAt
      });

      const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizationUrl.searchParams.set("client_id", googleClientId);
      authorizationUrl.searchParams.set("redirect_uri", callbackUrl.toString());
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", "openid email profile");
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("access_type", "offline");

      const payload = OAuthStartResponseSchema.parse({
        provider,
        state,
        callbackUrl: callbackUrl.toString(),
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
      redirectUri: parsedBody.data.redirectUri || undefined,
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
        role: data.user.role
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

      await repository.deleteSession(token);
      return reply.status(204).send();
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("identity-service");
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { setupTracing } = await import("@script-manifest/service-utils/tracing");
    const tracingSdk = setupTracing("identity-service");
    if (tracingSdk) {
      process.once("SIGTERM", () => {
        tracingSdk.shutdown().catch((err) => console.error("OTel SDK shutdown error", err));
      });
    }
    boot.phase("tracing initialized");
  }

  validateRequiredEnv(["DATABASE_URL"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4005);
  const server = buildServer();
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

function readBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
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
  callbackUrl: string
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

  let email: string;
  let displayName: string;

  if (useRealGoogle && provider === "google") {
    // Real Google: exchange authorization code for user info
    const googleResult = await exchangeGoogleCode(input.code, googleClientId, googleClientSecret, callbackUrl, stored.codeVerifier);
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

  const session = await repository.createSession(user.id);
  const payload = AuthSessionResponseSchema.parse({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    }
  });

  return { payload };
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
