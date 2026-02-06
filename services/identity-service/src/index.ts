import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import {
  AuthLoginRequestSchema,
  AuthMeResponseSchema,
  AuthRegisterRequestSchema,
  AuthSessionResponseSchema
} from "@script-manifest/contracts";
import {
  type IdentityRepository,
  PgIdentityRepository,
  verifyPassword
} from "./repository.js";

export type IdentityServiceOptions = {
  logger?: boolean;
  repository?: IdentityRepository;
};

export function buildServer(options: IdentityServiceOptions = {}): FastifyInstance {
  const repository = options.repository ?? new PgIdentityRepository();
  const server = Fastify({ logger: options.logger ?? true });

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
    // Use a dummy hash if user doesn't exist
    const dummySalt = "0000000000000000000000000000000000000000000000000000000000000000";
    const dummyHash = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    
    const isValid = user
      ? verifyPassword(parsedBody.data.password, user.passwordHash, user.passwordSalt)
      : verifyPassword(parsedBody.data.password, dummyHash, dummySalt);
    
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
