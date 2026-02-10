import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
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
  const server = Fastify({ logger: options.logger ?? true });
  const oauthIssuerBase =
    process.env.IDENTITY_SERVICE_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? "4005"}`;
  const oauthStateStore = new Map<string, OauthState>();

  server.addHook("onReady", async () => {
    await repository.init();
  });

  server.get("/health", async () => ({ service: "identity-service", ok: true }));

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
        displayName: user.displayName
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
        displayName: user.displayName
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

    const identity = toOAuthIdentity(provider, parsedBody.data.loginHint);
    const state = createOpaqueToken();
    const mockCode = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    oauthStateStore.set(state, {
      provider,
      code: mockCode,
      email: identity.email,
      displayName: identity.displayName,
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

    const result = await completeOAuthSession(repository, oauthStateStore, provider, parsedBody.data);
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

    const result = await completeOAuthSession(repository, oauthStateStore, provider, parsedQuery.data);
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
        displayName: data.user.displayName
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

export async function startServer(): Promise<void> {
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

type OauthState = {
  provider: OAuthProvider;
  code: string;
  email: string;
  displayName: string;
  expiresAt: string;
};

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

async function completeOAuthSession(
  repository: IdentityRepository,
  oauthStateStore: Map<string, OauthState>,
  provider: OAuthProvider,
  input: { state: string; code: string }
): Promise<
  | { payload: ReturnType<typeof AuthSessionResponseSchema.parse> }
  | { error: string; statusCode: number }
> {
  const stored = oauthStateStore.get(input.state);
  if (!stored) {
    return { error: "invalid_oauth_state", statusCode: 400 };
  }

  if (stored.expiresAt < new Date().toISOString()) {
    oauthStateStore.delete(input.state);
    return { error: "oauth_state_expired", statusCode: 400 };
  }

  if (stored.provider !== provider) {
    return { error: "oauth_provider_mismatch", statusCode: 400 };
  }

  if (stored.code !== input.code) {
    return { error: "invalid_oauth_code", statusCode: 400 };
  }

  oauthStateStore.delete(input.state);

  let user = await repository.findUserByEmail(stored.email);
  if (!user) {
    user = await repository.registerUser({
      email: stored.email,
      displayName: stored.displayName,
      password: `oauth-${provider}-${randomUUID()}-${createOpaqueToken()}`
    });
  }
  if (!user) {
    user = await repository.findUserByEmail(stored.email);
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
      displayName: user.displayName
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
