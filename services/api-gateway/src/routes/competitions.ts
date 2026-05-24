import type { FastifyInstance } from "fastify";
import {
  CompetitionUpsertRequestSchema,
  CompetitionVisibilityUpdateSchema,
  CompetitionAccessTypeUpdateSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  buildQuerySuffix,
  proxyJsonRequest,
  resolveAdminByRole,
  resolveUserId
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

  server.post<{ Params: { competitionId: string } }>("/api/v1/competitions/:competitionId/deadline-reminders", async (req, reply) => {
    const { competitionId } = req.params;
    // TODO: add validation schema
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

  server.post<{ Params: { competitionId: string } }>("/api/v1/competitions/:competitionId/save", async (req, reply) => {
    const { competitionId } = req.params;
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const body = req.body && typeof req.body === "object" ? req.body as { remindDaysBefore?: unknown } : {};
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/competitions/${encodeURIComponent(competitionId)}/save`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerId: userId, remindDaysBefore: body.remindDaysBefore })
      }
    );
  });

  server.delete<{ Params: { competitionId: string } }>("/api/v1/competitions/:competitionId/save", async (req, reply) => {
    const { competitionId } = req.params;
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/competitions/${encodeURIComponent(competitionId)}/save?writerId=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
  });

  server.get("/api/v1/writers/me/saved-competitions", async (req, reply) => {
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/writers/${encodeURIComponent(userId)}/saved-competitions`,
      { method: "GET" }
    );
  });

  server.post("/api/v1/admin/competitions", async (req, reply) => {
    const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = CompetitionUpsertRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.competitionDirectoryBase}/internal/admin/competitions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify(parsed.data)
    });
  });

  server.put<{ Params: { competitionId: string } }>("/api/v1/admin/competitions/:competitionId", async (req, reply) => {
    const { competitionId } = req.params;
    const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = CompetitionUpsertRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
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
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.post<{ Params: { competitionId: string } }>("/api/v1/admin/competitions/:competitionId/cancel", async (req, reply) => {
    const { competitionId } = req.params;
    const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/admin/competitions/${encodeURIComponent(competitionId)}/cancel`,
      {
        method: "POST",
        headers: {
          "x-admin-user-id": adminUserId
        }
      }
    );
  });

  server.patch<{ Params: { competitionId: string } }>("/api/v1/admin/competitions/:competitionId/visibility", async (req, reply) => {
    const { competitionId } = req.params;
    const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = CompetitionVisibilityUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/admin/competitions/${encodeURIComponent(competitionId)}/visibility`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId
        },
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.patch<{ Params: { competitionId: string } }>("/api/v1/admin/competitions/:competitionId/access-type", async (req, reply) => {
    const { competitionId } = req.params;
    const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers, req.log);
    if (!adminUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = CompetitionAccessTypeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/admin/competitions/${encodeURIComponent(competitionId)}/access-type`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId
        },
        body: JSON.stringify(parsed.data)
      }
    );
  });
}
