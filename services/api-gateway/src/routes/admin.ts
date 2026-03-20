import type { FastifyInstance } from "fastify";
import {
  AdminUserUpdateRequestSchema,
  ContentReportCreateRequestSchema,
  ModerationActionRequestSchema,
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  clearAuthCacheByUserId,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerAdminRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Admin User Management ──────────────────────────────────────

  server.get("/api/v1/admin/users", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  server.get<{ Params: { id: string } }>("/api/v1/admin/users/:id", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  server.patch<{ Params: { id: string } }>("/api/v1/admin/users/:id", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AdminUserUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}`,
      {
        method: "PATCH",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );

    if (parsed.data.role) {
      clearAuthCacheByUserId(req.params.id);
    }

    return result;
  });

  // ── Audit Log ────────────────────────────────────────────────

  server.get("/api/v1/admin/audit-log", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/audit-log${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Content Reports (User-facing) ────────────────────────────

  server.post("/api/v1/reports", async (req, reply) => {
    const userId = await getUserIdFromAuth(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers.authorization, req.log
    );
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const parsed = ContentReportCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/reports`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Moderation Queue (Admin) ─────────────────────────────────

  server.get("/api/v1/admin/moderation/queue", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/moderation/queue${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  server.post<{ Params: { reportId: string } }>("/api/v1/admin/moderation/:reportId/action", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = ModerationActionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/moderation/${encodeURIComponent(req.params.reportId)}/action`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Platform Metrics (Admin Dashboard) ───────────────────────

  server.get("/api/v1/admin/metrics", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    // Aggregate metrics from identity service (user counts + reports)
    // Other metrics from ranking service (appeals/flags) and profile service (projects)
    const headers = addAuthUserIdHeader({}, adminId, "admin");

    const [identityRes, rankingAppealsRes, rankingFlagsRes, profilesRes] = await Promise.allSettled([
      ctx.requestFn(`${ctx.identityServiceBase}/internal/admin/metrics`, { method: "GET", headers }),
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/appeals?status=open`, { method: "GET" }),
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/flags?status=open`, { method: "GET" }),
      ctx.requestFn(`${ctx.profileServiceBase}/internal/profiles?limit=0`, { method: "GET" })
    ]);

    let totalUsers = 0;
    let activeUsers30d = 0;
    let pendingReports = 0;
    let pendingAppeals = 0;
    let pendingFlags = 0;
    let totalProjects = 0;

    if (identityRes.status === "fulfilled" && identityRes.value.statusCode === 200) {
      const body = await identityRes.value.body.json() as { metrics?: { totalUsers?: number; activeUsers30d?: number; pendingReports?: number } };
      totalUsers = body.metrics?.totalUsers ?? 0;
      activeUsers30d = body.metrics?.activeUsers30d ?? 0;
      pendingReports = body.metrics?.pendingReports ?? 0;
    }

    if (rankingAppealsRes.status === "fulfilled" && rankingAppealsRes.value.statusCode === 200) {
      const body = await rankingAppealsRes.value.body.json() as { appeals?: unknown[] };
      pendingAppeals = body.appeals?.length ?? 0;
    } else if (rankingAppealsRes.status === "fulfilled") {
      await rankingAppealsRes.value.body.dump();
    }

    if (rankingFlagsRes.status === "fulfilled" && rankingFlagsRes.value.statusCode === 200) {
      const body = await rankingFlagsRes.value.body.json() as { flags?: unknown[] };
      pendingFlags = body.flags?.length ?? 0;
    } else if (rankingFlagsRes.status === "fulfilled") {
      await rankingFlagsRes.value.body.dump();
    }

    if (profilesRes.status === "fulfilled" && profilesRes.value.statusCode === 200) {
      const body = await profilesRes.value.body.json() as { total?: number };
      totalProjects = body.total ?? 0;
    } else if (profilesRes.status === "fulfilled") {
      await profilesRes.value.body.dump();
    }

    return reply.send({
      metrics: {
        totalUsers,
        activeUsers30d,
        totalProjects,
        openDisputes: 0,
        pendingAppeals,
        pendingFlags,
        pendingReports
      }
    });
  });
}
