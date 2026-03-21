import type { FastifyInstance } from "fastify";
import { type GatewayContext, addAuthUserIdHeader, buildQuerySuffix, proxyJsonRequest, resolveUserId } from "../helpers.js";

export function registerNotificationRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/notifications", async (req, reply) => {
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/events/${encodeURIComponent(userId)}${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) },
      req.id
    );
  });

  server.get("/api/v1/notifications/unread-count", async (req, reply) => {
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/events/${encodeURIComponent(userId)}/unread-count`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) },
      req.id
    );
  });

  server.patch<{ Params: { id: string } }>("/api/v1/notifications/:id/read", async (req, reply) => {
    const userId = await resolveUserId(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/events/${encodeURIComponent(req.params.id)}/read`,
      {
        method: "PATCH",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify({ targetUserId: userId })
      },
      req.id
    );
  });
}
