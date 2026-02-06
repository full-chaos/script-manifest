import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import { request } from "undici";

type RequestFn = typeof request;

export type ApiGatewayOptions = {
  logger?: boolean;
  requestFn?: RequestFn;
  profileServiceBase?: string;
  competitionDirectoryBase?: string;
  submissionTrackingBase?: string;
};

export function buildServer(options: ApiGatewayOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const requestFn = options.requestFn ?? request;
  const profileServiceBase = options.profileServiceBase ?? "http://localhost:4001";
  const competitionDirectoryBase = options.competitionDirectoryBase ?? "http://localhost:4002";
  const submissionTrackingBase = options.submissionTrackingBase ?? "http://localhost:4004";

  server.get("/health", async () => ({ service: "api-gateway", ok: true }));

  server.get("/api/v1/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const upstream = await requestFn(`${profileServiceBase}/internal/profiles/${writerId}`);
    const body = await upstream.body.json();
    return reply.status(upstream.statusCode).send(body);
  });

  server.get("/api/v1/competitions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    const upstream = await requestFn(`${competitionDirectoryBase}/internal/competitions${querySuffix}`);
    const body = await upstream.body.json();
    return reply.status(upstream.statusCode).send(body);
  });

  server.get("/api/v1/submissions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    const upstream = await requestFn(`${submissionTrackingBase}/internal/submissions${querySuffix}`);
    const body = await upstream.body.json();
    return reply.status(upstream.statusCode).send(body);
  });

  server.post("/api/v1/submissions", async (req, reply) => {
    const upstream = await requestFn(`${submissionTrackingBase}/internal/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
    const body = await upstream.body.json();
    return reply.status(upstream.statusCode).send(body);
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
