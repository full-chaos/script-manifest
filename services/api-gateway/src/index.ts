import Fastify from "fastify";
import { request } from "undici";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4000);
const profileServiceBase = process.env.PROFILE_SERVICE_URL ?? "http://localhost:4001";

server.get("/health", async () => ({ service: "api-gateway", ok: true }));

server.get("/api/v1/profiles/:writerId", async (req, reply) => {
  const { writerId } = req.params as { writerId: string };
  const upstream = await request(`${profileServiceBase}/internal/profiles/${writerId}`);
  const body = await upstream.body.json();
  return reply.status(upstream.statusCode).send(body);
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
