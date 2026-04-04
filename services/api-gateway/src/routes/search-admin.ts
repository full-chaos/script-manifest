import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerSearchAdminRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/admin/search/status", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/admin/search/status`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  server.post("/api/v1/admin/search/reindex", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return reply.status(200).send({
      message: "Reindex is not required — search uses PostgreSQL FTS with auto-maintained generated columns.",
      type: "all",
      status: "not_applicable"
    });
  });

  server.post<{ Params: { type: string } }>("/api/v1/admin/search/reindex/:type", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return reply.status(200).send({
      message: "Reindex is not required — search uses PostgreSQL FTS with auto-maintained generated columns.",
      type: req.params.type,
      status: "not_applicable"
    });
  });
}
