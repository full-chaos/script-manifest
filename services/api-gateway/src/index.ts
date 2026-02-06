import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { pathToFileURL } from "node:url";
import { request } from "undici";

type RequestFn = typeof request;

export type ApiGatewayOptions = {
  logger?: boolean;
  requestFn?: RequestFn;
  identityServiceBase?: string;
  profileServiceBase?: string;
  competitionDirectoryBase?: string;
  submissionTrackingBase?: string;
};

export function buildServer(options: ApiGatewayOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const requestFn = options.requestFn ?? request;
  const identityServiceBase = options.identityServiceBase ?? "http://localhost:4005";
  const profileServiceBase = options.profileServiceBase ?? "http://localhost:4001";
  const competitionDirectoryBase = options.competitionDirectoryBase ?? "http://localhost:4002";
  const submissionTrackingBase = options.submissionTrackingBase ?? "http://localhost:4004";

  server.get("/health", async () => ({ service: "api-gateway", ok: true }));

  server.post("/api/v1/auth/register", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${identityServiceBase}/internal/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
  });

  server.post("/api/v1/auth/login", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${identityServiceBase}/internal/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
  });

  server.get("/api/v1/auth/me", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${identityServiceBase}/internal/auth/me`, {
      method: "GET",
      headers: copyAuthHeader(req.headers.authorization)
    });
  });

  server.post("/api/v1/auth/logout", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${identityServiceBase}/internal/auth/logout`, {
      method: "POST",
      headers: copyAuthHeader(req.headers.authorization)
    });
  });

  server.get("/api/v1/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/profiles/${encodeURIComponent(writerId)}`,
      {
        method: "GET"
      }
    );
  });

  server.put("/api/v1/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/profiles/${encodeURIComponent(writerId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/projects", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/projects${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/projects", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${profileServiceBase}/internal/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
  });

  server.get("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "GET"
      }
    );
  });

  server.put("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.delete("/api/v1/projects/:projectId", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    return proxyJsonRequest(
      reply,
      requestFn,
      `${profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
      {
        method: "DELETE"
      }
    );
  });

  server.get("/api/v1/competitions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      requestFn,
      `${competitionDirectoryBase}/internal/competitions${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.get("/api/v1/submissions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      requestFn,
      `${submissionTrackingBase}/internal/submissions${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/submissions", async (req, reply) => {
    return proxyJsonRequest(reply, requestFn, `${submissionTrackingBase}/internal/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
  });

  return server;
}

export function buildQuerySuffix(rawQuery: unknown): string {
  const query = rawQuery as Record<string, string | string[] | undefined>;
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      searchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const arrayValue of value) {
        searchParams.append(key, arrayValue);
      }
    }
  }

  return searchParams.size > 0 ? `?${searchParams.toString()}` : "";
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4000);
  const server = buildServer({
    identityServiceBase: process.env.IDENTITY_SERVICE_URL,
    profileServiceBase: process.env.PROFILE_SERVICE_URL,
    competitionDirectoryBase: process.env.COMPETITION_DIRECTORY_SERVICE_URL,
    submissionTrackingBase: process.env.SUBMISSION_TRACKING_SERVICE_URL
  });

  await server.listen({ port, host: "0.0.0.0" });
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

function copyAuthHeader(authorization: string | undefined): Record<string, string> {
  if (!authorization) {
    return {};
  }

  return { authorization };
}

async function proxyJsonRequest(
  reply: FastifyReply,
  requestFn: RequestFn,
  url: string,
  options: Parameters<RequestFn>[1]
) {
  try {
    const upstream = await requestFn(url, options);
    const rawBody = await upstream.body.text();
    const body = rawBody.length > 0 ? safeJsonParse(rawBody) : null;
    return reply.status(upstream.statusCode).send(body);
  } catch (error) {
    return reply.status(502).send({
      error: "upstream_unavailable",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}
