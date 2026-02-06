import Fastify from "fastify";
import { request } from "undici";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4000);
const profileServiceBase = process.env.PROFILE_SERVICE_URL ?? "http://localhost:4001";
const competitionDirectoryBase =
  process.env.COMPETITION_DIRECTORY_SERVICE_URL ?? "http://localhost:4002";
const submissionTrackingBase =
  process.env.SUBMISSION_TRACKING_SERVICE_URL ?? "http://localhost:4004";

server.get("/health", async () => ({ service: "api-gateway", ok: true }));

server.get("/api/v1/profiles/:writerId", async (req, reply) => {
  const { writerId } = req.params as { writerId: string };
  const upstream = await request(`${profileServiceBase}/internal/profiles/${writerId}`);
  const body = await upstream.body.json();
  return reply.status(upstream.statusCode).send(body);
});

server.get("/api/v1/competitions", async (req, reply) => {
  const querySuffix = buildQuerySuffix(req.query);
  const upstream = await request(
    `${competitionDirectoryBase}/internal/competitions${querySuffix}`
  );
  const body = await upstream.body.json();
  return reply.status(upstream.statusCode).send(body);
});

server.get("/api/v1/submissions", async (req, reply) => {
  const querySuffix = buildQuerySuffix(req.query);
  const upstream = await request(
    `${submissionTrackingBase}/internal/submissions${querySuffix}`
  );
  const body = await upstream.body.json();
  return reply.status(upstream.statusCode).send(body);
});

server.post("/api/v1/submissions", async (req, reply) => {
  const upstream = await request(`${submissionTrackingBase}/internal/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body ?? {})
  });
  const body = await upstream.body.json();
  return reply.status(upstream.statusCode).send(body);
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

function buildQuerySuffix(rawQuery: unknown): string {
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
