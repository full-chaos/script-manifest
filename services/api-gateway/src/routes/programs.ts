import type { FastifyInstance } from "fastify";
import {
  ProgramApplicationCreateRequestSchema,
  ProgramApplicationReviewRequestSchema,
  ProgramCohortCreateRequestSchema,
  ProgramMentorshipMatchCreateRequestSchema,
  ProgramSessionAttendanceUpsertRequestSchema,
  ProgramSessionCreateRequestSchema
} from "@script-manifest/contracts";
import {
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminByRole,
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

  server.post<{ Params: { programId: string } }>("/api/v1/programs/:programId/applications", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = ProgramApplicationCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/programs/${encodeURIComponent(programId)}/applications`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get<{ Params: { programId: string } }>("/api/v1/programs/:programId/applications/me", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
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

  server.get<{ Params: { programId: string } }>("/api/v1/programs/:programId/application-form", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/programs/${encodeURIComponent(programId)}/application-form`,
        { method: "GET" }
      );
    }
  });

  server.get<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/applications", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
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

  server.post<{ Params: { programId: string; applicationId: string } }>("/api/v1/admin/programs/:programId/applications/:applicationId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, applicationId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramApplicationReviewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.put<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/application-form", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/application-form`,
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

  server.put<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/scoring-rubric", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/scoring-rubric`,
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

  server.get<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
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

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/cohorts", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramCohortCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/availability", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/availability`,
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

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/scheduling/match", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/scheduling/match`,
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

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/sessions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramSessionCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.post<{ Params: { programId: string; sessionId: string } }>("/api/v1/admin/programs/:programId/sessions/:sessionId/attendance", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, sessionId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramSessionAttendanceUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.patch<{ Params: { programId: string; sessionId: string } }>("/api/v1/admin/programs/:programId/sessions/:sessionId/integration", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, sessionId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}/integration`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-admin-user-id": adminUserId
          },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post<{ Params: { programId: string; sessionId: string } }>("/api/v1/admin/programs/:programId/sessions/:sessionId/reminders/dispatch", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId, sessionId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}/reminders/dispatch`,
        {
          method: "POST",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/mentorship/matches", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = ProgramMentorshipMatchCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
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
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/outcomes", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/outcomes`,
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

  server.post<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/crm-sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/crm-sync`,
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

  server.get<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/crm-sync", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const querySuffix = buildQuerySuffix(req.query);
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/${encodeURIComponent(programId)}/crm-sync${querySuffix}`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post("/api/v1/admin/programs/jobs/run", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.programsServiceBase}/internal/admin/programs/jobs/run`,
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

  server.get<{ Params: { programId: string } }>("/api/v1/admin/programs/:programId/analytics", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { programId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
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
