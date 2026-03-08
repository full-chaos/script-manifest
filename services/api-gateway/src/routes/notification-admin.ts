import type { FastifyInstance } from "fastify";
import {
  CreateNotificationTemplateRequestSchema,
  SendBroadcastRequestSchema,
  SendDirectNotificationRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerNotificationAdminRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Templates ─────────────────────────────────────────────────

  server.post("/api/v1/admin/notifications/templates", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = CreateNotificationTemplateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/admin/notifications/templates`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  server.get("/api/v1/admin/notifications/templates", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/admin/notifications/templates`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Broadcast ─────────────────────────────────────────────────

  server.post("/api/v1/admin/notifications/broadcast", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SendBroadcastRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/admin/notifications/broadcast`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Direct Notification ───────────────────────────────────────

  server.post("/api/v1/admin/notifications/direct", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SendDirectNotificationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/admin/notifications/direct`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── History ───────────────────────────────────────────────────

  server.get("/api/v1/admin/notifications/history", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.notificationServiceBase}/internal/admin/notifications/history${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });
}
