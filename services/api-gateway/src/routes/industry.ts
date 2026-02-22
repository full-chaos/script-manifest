import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerIndustryRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/industry/accounts", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
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
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/industry/accounts/:accountId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.industryPortalBase}/internal/accounts/${encodeURIComponent(accountId)}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/industry/accounts/:accountId/verify", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const { accountId } = req.params as { accountId: string };
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
      `${ctx.industryPortalBase}/internal/accounts/${encodeURIComponent(accountId)}/verify`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-user-id": adminUserId
        },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.put("/api/v1/industry/entitlements/:writerUserId", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const { writerUserId } = req.params as { writerUserId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized", detail: "Could not resolve user from auth token" });
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
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/industry/entitlements/:writerUserId/check", {
    config: { rateLimit: { max: 40, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const { writerUserId } = req.params as { writerUserId: string };
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.industryPortalBase}/internal/entitlements/${encodeURIComponent(writerUserId)}/check${querySuffix}`,
      {
        method: "GET"
      }
    );
  });
}
