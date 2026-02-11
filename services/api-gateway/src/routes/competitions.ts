import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  buildQuerySuffix,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerCompetitionRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/competitions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/competitions${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/competitions/:competitionId/deadline-reminders", async (req, reply) => {
    const { competitionId } = req.params as { competitionId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/competitions/${encodeURIComponent(competitionId)}/deadline-reminders`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.post("/api/v1/admin/competitions", async (req, reply) => {
    const adminUserId = await resolveAdminUserId(
      ctx.requestFn,
      ctx.identityServiceBase,
      req.headers,
      ctx.competitionAdminAllowlist
    );
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.competitionDirectoryBase}/internal/admin/competitions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify(req.body ?? {})
    });
  });

  server.put("/api/v1/admin/competitions/:competitionId", async (req, reply) => {
    const { competitionId } = req.params as { competitionId: string };
    const adminUserId = await resolveAdminUserId(
      ctx.requestFn,
      ctx.identityServiceBase,
      req.headers,
      ctx.competitionAdminAllowlist
    );
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/admin/competitions/${encodeURIComponent(competitionId)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId
        },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });
}
