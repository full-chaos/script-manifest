import type { FastifyInstance } from "fastify";
import { addAuthUserIdHeader, proxyJsonRequest, resolveAdminByRole, type GatewayContext } from "../helpers.js";

const PUBLIC_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=900";
const ADMIN_CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=240";

export function registerTrustProofMetricsRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/trust-proof-metrics", async (_req, reply) => {
    void reply.header("Cache-Control", PUBLIC_CACHE_CONTROL);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.metricsServiceBase ?? "http://localhost:4014"}/internal/trust-proof-metrics/public`,
      { method: "GET" }
    );
  });

  server.get("/api/v1/admin/trust-proof-metrics", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn,
      ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    void reply.header("Cache-Control", ADMIN_CACHE_CONTROL);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.metricsServiceBase ?? "http://localhost:4014"}/internal/admin/trust-proof-metrics`,
      { method: "GET", headers: { ...addAuthUserIdHeader({}, adminId, "admin"), "x-auth-user-role": "admin" } },
      req.id
    );
  });

  server.post("/api/v1/admin/trust-proof-metrics/refresh", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn,
      ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    void reply.header("Cache-Control", ADMIN_CACHE_CONTROL);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.metricsServiceBase ?? "http://localhost:4014"}/internal/admin/trust-proof-metrics/refresh`,
      { method: "POST", headers: { ...addAuthUserIdHeader({}, adminId, "admin"), "x-auth-user-role": "admin" } },
      req.id
    );
  });
}
