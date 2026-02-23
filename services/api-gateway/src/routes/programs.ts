import type { FastifyInstance } from "fastify";
import {
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminUserId,
  type GatewayContext
} from "../helpers.js";

export function registerProgramsRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/programs", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/programs${querySuffix}`,
        { method: "GET" }
      );
    }
  });

  server.post("/api/v1/programs/:programId/applications", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/programs/${encodeURIComponent(programId)}/applications`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/programs/:programId/applications/me", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/programs/${encodeURIComponent(programId)}/applications/me`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.get("/api/v1/admin/programs/:programId/applications", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/applications`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/:programId/applications/:applicationId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, applicationId } = req.params as { programId: string; applicationId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/applications/${encodeURIComponent(applicationId)}/review`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/cohorts`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/cohorts`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/:programId/sessions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/sessions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/:programId/sessions/:sessionId/attendance", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, sessionId } = req.params as { programId: string; sessionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/:programId/mentorship/matches", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/mentorship/matches`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/admin/programs/:programId/analytics", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params as { programId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.industryAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/analytics`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });
}
