import type { FastifyInstance } from "fastify";
import { type GatewayContext, copyAuthHeader, proxyJsonRequest } from "../helpers.js";

export function registerOnboardingRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/onboarding/status", {
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/onboarding/status`, {
        method: "GET",
        headers: copyAuthHeader(req.headers.authorization)
      });
    }
  });

  server.patch("/api/v1/onboarding/progress", {
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/onboarding/progress`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...copyAuthHeader(req.headers.authorization) },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });
}
