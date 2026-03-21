import type { FastifyInstance } from "fastify";
import {
  IndustryAccountCreateRequestSchema,
  IndustryAccountVerificationRequestSchema,
  IndustryEntitlementUpsertRequestSchema,
  IndustryListCreateRequestSchema,
  IndustryListItemCreateRequestSchema,
  IndustryListShareTeamRequestSchema,
  IndustryMandateCreateRequestSchema,
  IndustryMandateSubmissionCreateRequestSchema,
  IndustryMandateSubmissionReviewRequestSchema,
  IndustryNoteCreateRequestSchema,
  IndustryTeamCreateRequestSchema,
  IndustryTeamMemberUpsertRequestSchema,
  IndustryWeeklyDigestRunRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerIndustryRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/industry/accounts", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryAccountCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/accounts`,
        {
          method: "POST",
          headers: addAuthUserIdHeader(
            { "content-type": "application/json" },
            userId
          ),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get<{ Params: { accountId: string } }>("/api/v1/industry/accounts/:accountId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { accountId } = req.params;
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/accounts/${encodeURIComponent(accountId)}`,
        {
          method: "GET"
        }
      );
    }
  });

  server.post<{ Params: { accountId: string } }>("/api/v1/industry/accounts/:accountId/verify", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { accountId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IndustryAccountVerificationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/accounts/${encodeURIComponent(accountId)}/verify`,
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

  server.put<{ Params: { writerUserId: string } }>("/api/v1/industry/entitlements/:writerUserId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { writerUserId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryEntitlementUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/entitlements/${encodeURIComponent(writerUserId)}`,
        {
          method: "PUT",
          headers: addAuthUserIdHeader(
            { "content-type": "application/json" },
            userId
          ),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get<{ Params: { writerUserId: string } }>("/api/v1/industry/entitlements/:writerUserId/check", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { writerUserId } = req.params;
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/entitlements/${encodeURIComponent(writerUserId)}/check${querySuffix}`,
        {
          method: "GET"
        }
      );
    }
  });

  server.get("/api/v1/industry/talent-search", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/talent-search${querySuffix}`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.get("/api/v1/industry/lists", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/lists`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.post("/api/v1/industry/lists", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryListCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/lists`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.post<{ Params: { listId: string } }>("/api/v1/industry/lists/:listId/items", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { listId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryListItemCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/lists/${encodeURIComponent(listId)}/items`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.post<{ Params: { listId: string } }>("/api/v1/industry/lists/:listId/notes", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { listId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryNoteCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/lists/${encodeURIComponent(listId)}/notes`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get("/api/v1/industry/mandates", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/mandates${querySuffix}`,
        {
          method: "GET"
        }
      );
    }
  });

  server.post("/api/v1/industry/mandates", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IndustryMandateCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/mandates`,
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

  server.post<{ Params: { mandateId: string } }>("/api/v1/industry/mandates/:mandateId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { mandateId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryMandateSubmissionCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/mandates/${encodeURIComponent(mandateId)}/submissions`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get<{ Params: { mandateId: string } }>("/api/v1/industry/mandates/:mandateId/submissions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { mandateId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/mandates/${encodeURIComponent(mandateId)}/submissions`,
        {
          method: "GET",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post<{ Params: { mandateId: string; submissionId: string } }>("/api/v1/industry/mandates/:mandateId/submissions/:submissionId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { mandateId, submissionId } = req.params;
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      const parsed = IndustryMandateSubmissionReviewRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/mandates/${encodeURIComponent(mandateId)}/submissions/${encodeURIComponent(submissionId)}/review`,
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

  server.post("/api/v1/industry/talent-index/rebuild", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const adminUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!adminUserId) {
        return reply.status(403).send({ error: "forbidden" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/talent-index/rebuild`,
        {
          method: "POST",
          headers: { "x-admin-user-id": adminUserId }
        }
      );
    }
  });

  server.post<{ Params: { listId: string } }>("/api/v1/industry/lists/:listId/share-team", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { listId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryListShareTeamRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/lists/${encodeURIComponent(listId)}/share-team`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get("/api/v1/industry/teams", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/teams`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.post("/api/v1/industry/teams", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryTeamCreateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/teams`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.put<{ Params: { teamId: string } }>("/api/v1/industry/teams/:teamId/members", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { teamId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryTeamMemberUpsertRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/teams/${encodeURIComponent(teamId)}/members`,
        {
          method: "PUT",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get("/api/v1/industry/activity", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/activity${querySuffix}`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.post("/api/v1/industry/digests/weekly/run", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const parsed = IndustryWeeklyDigestRunRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/digests/weekly/run`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get("/api/v1/industry/digests/weekly/runs", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/digests/weekly/runs${querySuffix}`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.get("/api/v1/industry/analytics", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/analytics${querySuffix}`,
        {
          method: "GET",
          headers: addAuthUserIdHeader({}, userId)
        }
      );
    }
  });

  server.post<{ Params: { scriptId: string } }>("/api/v1/industry/scripts/:scriptId/download", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { scriptId } = req.params;
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) {
        return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
      }
      // TODO: add validation schema
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.industryPortalBase}/internal/scripts/${encodeURIComponent(scriptId)}/download`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });
}
