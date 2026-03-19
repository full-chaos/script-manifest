import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerSearchAdminRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Search Index Status ────────────────────────────────────────

  server.get("/api/v1/admin/search/status", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.searchIndexerBase}/internal/admin/search/status`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Reindex All ────────────────────────────────────────────────

  server.post("/api/v1/admin/search/reindex", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.searchIndexerBase}/internal/admin/search/reindex`,
      { method: "POST", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Reindex by Type ────────────────────────────────────────────

  server.post<{ Params: { type: string } }>("/api/v1/admin/search/reindex/:type", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.searchIndexerBase}/internal/admin/search/reindex/${encodeURIComponent(req.params.type)}`,
      { method: "POST", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });
}
