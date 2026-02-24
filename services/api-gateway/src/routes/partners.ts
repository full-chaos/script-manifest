import type { FastifyInstance } from "fastify";
import {
  proxyJsonRequest,
  resolveAdminUserId,
  type GatewayContext
} from "../helpers.js";

export function registerPartnerRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/partners/competitions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.partnerDashboardServiceBase}/internal/partners/competitions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId
        },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.put("/api/v1/partners/competitions/:competitionId/memberships/:userId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId, userId } = req.params as { competitionId: string; userId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/memberships/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.put("/api/v1/partners/competitions/:competitionId/intake", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/intake`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
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

  server.get("/api/v1/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/judges/auto-assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/judges/auto-assign`,
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

  server.post("/api/v1/partners/competitions/:competitionId/judges/assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/judges/assign`,
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

  server.post("/api/v1/partners/competitions/:competitionId/evaluations", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/evaluations`,
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

  server.post("/api/v1/partners/competitions/:competitionId/normalize", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/normalize`,
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

  server.post("/api/v1/partners/competitions/:competitionId/publish-results", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/publish-results`,
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

  server.post("/api/v1/partners/competitions/:competitionId/draft-swaps", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/draft-swaps`,
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

  server.get("/api/v1/partners/competitions/:competitionId/analytics", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/analytics`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const adminUserId = await resolveAdminUserId(
        ctx.requestFn,
        ctx.identityServiceBase,
        req.headers as Record<string, unknown>,
        ctx.competitionAdminAllowlist
      );
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync`,
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
}
