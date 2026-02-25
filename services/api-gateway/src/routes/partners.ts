import type { FastifyInstance } from "fastify";
import {
  buildQuerySuffix,
  proxyJsonRequest,
  resolveUserId,
  type GatewayContext
} from "../helpers.js";

export function registerPartnerRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  const resolveActorUserId = async (headers: Record<string, unknown>): Promise<string | null> => {
    return resolveUserId(ctx.requestFn, ctx.identityServiceBase, headers);
  };

  const actorHeaders = (actorUserId: string, json = false): Record<string, string> => {
    const headers: Record<string, string> = {
      "x-admin-user-id": actorUserId,
      "x-partner-user-id": actorUserId
    };
    if (json) {
      headers["content-type"] = "application/json";
    }
    return headers;
  };

  server.post("/api/v1/partners/competitions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.partnerDashboardServiceBase}/internal/partners/competitions`, {
        method: "POST",
        headers: actorHeaders(actorUserId, true),
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.put("/api/v1/partners/competitions/:competitionId/memberships/:userId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId, userId } = req.params as { competitionId: string; userId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/memberships/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.put("/api/v1/partners/competitions/:competitionId/intake", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/intake`,
        {
          method: "PUT",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/partners/competitions/:competitionId/submissions", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
        {
          method: "GET",
          headers: actorHeaders(actorUserId)
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/messages", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/messages`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/partners/competitions/:competitionId/messages", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/messages${querySuffix}`,
        {
          method: "GET",
          headers: actorHeaders(actorUserId)
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/judges/auto-assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/judges/auto-assign`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/judges/assign", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/judges/assign`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/jobs/run", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/jobs/run`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/evaluations", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/evaluations`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/normalize", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/normalize`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/publish-results", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/publish-results`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/competitions/:competitionId/draft-swaps", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/draft-swaps`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/partners/competitions/:competitionId/analytics", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { competitionId } = req.params as { competitionId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/competitions/${encodeURIComponent(competitionId)}/analytics`,
        {
          method: "GET",
          headers: actorHeaders(actorUserId)
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync/jobs/claim", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync/jobs/claim`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId)
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/complete", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { jobId } = req.params as { jobId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync/jobs/${encodeURIComponent(jobId)}/complete`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync/jobs/:jobId/fail", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { jobId } = req.params as { jobId: string };
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync/jobs/${encodeURIComponent(jobId)}/fail`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId, true),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/partners/integrations/filmfreeway/sync/run-next", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const actorUserId = await resolveActorUserId(req.headers as Record<string, unknown>);
      if (!actorUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.partnerDashboardServiceBase}/internal/partners/integrations/filmfreeway/sync/run-next`,
        {
          method: "POST",
          headers: actorHeaders(actorUserId)
        }
      );
    }
  });
}
