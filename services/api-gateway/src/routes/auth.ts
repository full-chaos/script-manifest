import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  buildQuerySuffix,
  copyAuthHeader,
  proxyJsonRequest
} from "../helpers.js";

export function registerAuthRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/auth/register", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.get("/api/v1/auth/me", async (req, reply) => {
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/me`, {
      method: "GET",
      headers: copyAuthHeader(req.headers.authorization)
    });
  });

  server.post("/api/v1/auth/logout", async (req, reply) => {
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/logout`, {
      method: "POST",
      headers: copyAuthHeader(req.headers.authorization)
    });
  });

  server.post("/api/v1/auth/oauth/:provider/start", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { provider } = req.params as { provider: string };
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/start`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/auth/oauth/:provider/complete", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/auth/oauth/:provider/callback", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/callback${querySuffix}`,
      {
        method: "GET"
      }
    );
  });
}
