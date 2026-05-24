import type { FastifyInstance } from "fastify";
import {
  CompetitionUpsertRequestSchema,
  CompetitionVisibilityUpdateSchema,
  CompetitionAccessTypeUpdateSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
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

  server.get<{ Params: { projectId: string } }>("/api/v1/projects/:projectId/recommended-competitions", async (req, reply) => {
    const { projectId } = req.params;
    const userId = await resolveRecommendationProjectOwner(projectId, req.headers, req.log, ctx);
    if (!userId) {
      return reply.status(req.headers.authorization ? 403 : 401).send({ error: req.headers.authorization ? "forbidden" : "unauthorized" });
    }

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.competitionDirectoryBase}/internal/projects/${encodeURIComponent(projectId)}/recommended-competitions${querySuffix}`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.post<{ Params: { projectId: string; competitionId: string } }>("/api/v1/projects/:projectId/recommendations/:competitionId/dismiss", async (req, reply) => {
    return proxyRecommendationOverride(req.params.projectId, req.params.competitionId, "dismiss", "POST", req, reply, ctx);
  });

  server.delete<{ Params: { projectId: string; competitionId: string } }>("/api/v1/projects/:projectId/recommendations/:competitionId/dismiss", async (req, reply) => {
    return proxyRecommendationOverride(req.params.projectId, req.params.competitionId, "dismiss", "DELETE", req, reply, ctx);
  });

  server.post<{ Params: { projectId: string; competitionId: string } }>("/api/v1/projects/:projectId/recommendations/:competitionId/pin", async (req, reply) => {
    return proxyRecommendationOverride(req.params.projectId, req.params.competitionId, "pin", "POST", req, reply, ctx);
  });

  server.delete<{ Params: { projectId: string; competitionId: string } }>("/api/v1/projects/:projectId/recommendations/:competitionId/pin", async (req, reply) => {
    return proxyRecommendationOverride(req.params.projectId, req.params.competitionId, "pin", "DELETE", req, reply, ctx);
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

type ProjectOwnerResponse = {
  id?: string;
  ownerUserId?: string;
  project?: {
    id?: string;
    ownerUserId?: string;
  };
};

async function resolveRecommendationProjectOwner(
  projectId: string,
  headers: Record<string, unknown>,
  logger: Parameters<typeof resolveUserId>[3],
  ctx: GatewayContext
): Promise<string | null> {
  const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, headers, logger);
  if (!userId) return null;

  const projectResponse = await ctx.requestFn(
    `${ctx.profileServiceBase}/internal/projects/${encodeURIComponent(projectId)}`,
    { method: "GET" }
  );
  if (projectResponse.statusCode !== 200) return null;

  const body = await projectResponse.body.json() as ProjectOwnerResponse;
  const ownerUserId = body.project?.ownerUserId ?? body.ownerUserId;
  return ownerUserId === userId ? userId : null;
}

async function proxyRecommendationOverride(
  projectId: string,
  competitionId: string,
  action: "dismiss" | "pin",
  method: "POST" | "DELETE",
  req: { headers: Record<string, unknown>; log: Parameters<typeof resolveUserId>[3] },
  reply: Parameters<typeof proxyJsonRequest>[0],
  ctx: GatewayContext
) {
  const userId = await resolveRecommendationProjectOwner(projectId, req.headers, req.log, ctx);
  if (!userId) {
    return reply.status(req.headers.authorization ? 403 : 401).send({ error: req.headers.authorization ? "forbidden" : "unauthorized" });
  }

  return proxyJsonRequest(
    reply,
    ctx.requestFn,
    `${ctx.competitionDirectoryBase}/internal/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(competitionId)}/${action}`,
    {
      method,
      headers: addAuthUserIdHeader({}, userId)
    }
  );
}
