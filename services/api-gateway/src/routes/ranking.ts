import type { FastifyInstance } from "fastify";
import {
  CompetitionPrestigeUpsertRequestSchema,
  RankingAppealCreateRequestSchema,
  RankingAppealResolveRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerRankingRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Public ────────────────────────────────────────────────────────

  server.get("/api/v1/leaderboard", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/leaderboard${querySuffix}`,
      { method: "GET" }
    );
  });

  server.get<{ Params: { writerId: string } }>("/api/v1/rankings/writers/:writerId", async (req, reply) => {
    const { writerId } = req.params;
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/writers/${encodeURIComponent(writerId)}/score`,
      { method: "GET" }
    );
  });

  server.get<{ Params: { writerId: string } }>("/api/v1/rankings/writers/:writerId/badges", async (req, reply) => {
    const { writerId } = req.params;
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/writers/${encodeURIComponent(writerId)}/badges`,
      { method: "GET" }
    );
  });

  server.get("/api/v1/rankings/methodology", async (_req, reply) => {
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/methodology`,
      { method: "GET" }
    );
  });

  // ── Writer appeals ────────────────────────────────────────────────

  server.post("/api/v1/rankings/appeals", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const parsed = RankingAppealCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/appeals`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  // ── Admin: prestige ───────────────────────────────────────────────

  server.get("/api/v1/admin/rankings/prestige", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/prestige`,
      { method: "GET" }
    );
  });

  server.put<{ Params: { competitionId: string } }>("/api/v1/admin/rankings/prestige/:competitionId", async (req, reply) => {
    const { competitionId } = req.params;
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = CompetitionPrestigeUpsertRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/prestige/${encodeURIComponent(competitionId)}`,
      {
        method: "PUT",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  // ── Admin: recompute ──────────────────────────────────────────────

  server.post("/api/v1/admin/rankings/recompute", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    // TODO: add validation schema
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/recompute`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId)
      }
    );
  });

  // ── Admin: appeals management ─────────────────────────────────────

  server.get("/api/v1/admin/rankings/appeals", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/appeals${querySuffix}`,
      { method: "GET" }
    );
  });

  server.post<{ Params: { appealId: string } }>("/api/v1/admin/rankings/appeals/:appealId/resolve", async (req, reply) => {
    const { appealId } = req.params;
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const parsed = RankingAppealResolveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/appeals/${encodeURIComponent(appealId)}/resolve`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  // ── Admin: anti-gaming flags ──────────────────────────────────────

  server.get("/api/v1/admin/rankings/flags", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/flags${querySuffix}`,
      { method: "GET" }
    );
  });

  server.post<{ Params: { flagId: string } }>("/api/v1/admin/rankings/flags/:flagId/resolve", async (req, reply) => {
    const { flagId } = req.params;
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, ctx.competitionAdminAllowlist, req.log);
    if (!adminId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    // TODO: add validation schema
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.rankingServiceBase}/internal/flags/${encodeURIComponent(flagId)}/resolve`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });
}
