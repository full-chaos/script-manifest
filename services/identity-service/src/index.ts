import Fastify, { type FastifyInstance } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { request } from "undici";
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

// Dummy credentials for constant-time verification when user doesn't exist
const DUMMY_SALT = "0000000000000000000000000000000000000000000000000000000000000000";
const DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export type IdentityServiceOptions = {
  logger?: boolean;
  repository?: IdentityRepository;
};

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

  const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  const useRealGitHub = Boolean(githubClientId && githubClientSecret);

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "identity-service", ok, checks });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "identity-service", ok, checks });
  });

  server.post("/internal/auth/register", async (req, reply) => {
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
  });

  server.post("/internal/auth/login", async (req, reply) => {
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
  });

  server.post("/internal/auth/oauth/:provider/start", async (req, reply) => {
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

    if (useRealGitHub && provider === "github") {
      // Real GitHub OAuth flow
      const callbackUrl = new URL(`/internal/auth/oauth/${provider}/callback`, oauthIssuerBase);

      await repository.saveOAuthState(state, {
        codeVerifier,
        provider,
        redirectUri: parsedBody.data.redirectUri || undefined,
        expiresAt
      });

      const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
      authorizationUrl.searchParams.set("client_id", githubClientId);
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("scope", "user:email");
      if (parsedBody.data.redirectUri) {
        authorizationUrl.searchParams.set("redirect_uri", parsedBody.data.redirectUri);
      }

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
  });

  server.post("/internal/auth/oauth/:provider/complete", async (req, reply) => {
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

    const result = await completeOAuthSession(repository, provider, parsedBody.data, useRealGitHub, githubClientId, githubClientSecret);
    if ("error" in result) {
      return reply.status(result.statusCode).send({ error: result.error });
    }

    return reply.send(result.payload);
  });

  server.get("/internal/auth/oauth/:provider/callback", async (req, reply) => {
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

    const result = await completeOAuthSession(repository, provider, parsedQuery.data, useRealGitHub, githubClientId, githubClientSecret);
    if ("error" in result) {
      return reply.status(result.statusCode).send({ error: result.error });
    }

    return reply.send(result.payload);
  });

  server.get("/internal/auth/me", async (req, reply) => {
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
  });

  server.post("/internal/auth/logout", async (req, reply) => {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: "missing_bearer_token" });
    }

    await repository.deleteSession(token);
    return reply.status(204).send();
  });

  return server;
}

function warnMissingEnv(recommended: string[]): void {
  const missing = recommended.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[identity-service] Missing recommended env vars: ${missing.join(", ")}`);
  }
}

export async function startServer(): Promise<void> {
  warnMissingEnv(["DATABASE_URL"]);
  const port = Number(process.env.PORT ?? 4005);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
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

// Exchange a GitHub authorization code for user info via the real GitHub API
async function exchangeGitHubCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{ email: string; displayName: string } | { error: string }> {
  // Exchange code for access token
  const tokenResponse = await request("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  });

  const tokenBody = await tokenResponse.body.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenBody.access_token) {
    return { error: tokenBody.error_description ?? tokenBody.error ?? "github_token_exchange_failed" };
  }

  const accessToken = tokenBody.access_token;

  // Fetch user profile
  const userResponse = await request("https://api.github.com/user", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "user-agent": "script-manifest-identity-service"
    }
  });

  const userBody = await userResponse.body.json() as {
    login?: string;
    name?: string;
    email?: string;
  };

  // Fetch verified emails
  const emailsResponse = await request("https://api.github.com/user/emails", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "user-agent": "script-manifest-identity-service"
    }
  });

  const emailsBody = await emailsResponse.body.json() as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  // Find the primary verified email
  const primaryEmail = emailsBody.find((e) => e.primary && e.verified)?.email
    ?? emailsBody.find((e) => e.verified)?.email;

  if (!primaryEmail) {
    return { error: "github_no_verified_email" };
  }

  const displayName = userBody.name || userBody.login || primaryEmail.split("@")[0] || "GitHub User";

  return { email: primaryEmail, displayName };
}

async function completeOAuthSession(
  repository: IdentityRepository,
  provider: OAuthProvider,
  input: { state: string; code: string },
  useRealGitHub: boolean,
  githubClientId: string,
  githubClientSecret: string
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

  if (useRealGitHub && provider === "github") {
    // Real GitHub: exchange authorization code for user info
    const ghResult = await exchangeGitHubCode(input.code, githubClientId, githubClientSecret);
    if ("error" in ghResult) {
      return { error: ghResult.error, statusCode: 400 };
    }
    email = ghResult.email;
    displayName = ghResult.displayName;
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
