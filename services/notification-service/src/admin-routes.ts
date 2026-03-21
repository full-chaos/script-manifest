import type { FastifyInstance } from "fastify";
import {
  CreateNotificationTemplateRequestSchema,
  SendBroadcastRequestSchema,
  SendDirectNotificationRequestSchema,
  NotificationHistoryRequestSchema
} from "@script-manifest/contracts";
import { requireAdminServiceToken } from "@script-manifest/service-utils";
import { randomUUID } from "node:crypto";
import type { NotificationAdminRepository } from "./admin-repository.js";
import type { NotificationRepository } from "./repository.js";

function estimateRecipientCount(audience: string): number {
  if (audience === "all") return 100; // placeholder estimate
  if (audience.startsWith("role:")) return 10; // placeholder
  if (audience.startsWith("user:")) return 1;
  return 0;
}

export function registerNotificationAdminRoutes(server: FastifyInstance, adminRepo: NotificationAdminRepository, eventRepo?: NotificationRepository): void {
  // ── Templates ─────────────────────────────────────────────────

  server.post("/internal/admin/notifications/templates", async (req, reply) => {
    const adminId = requireAdminServiceToken(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = CreateNotificationTemplateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const template = await adminRepo.createTemplate({ ...parsed.data, createdBy: adminId });
    return reply.status(201).send({ template });
  });

  server.get("/internal/admin/notifications/templates", async (req, reply) => {
    const adminId = requireAdminServiceToken(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const templates = await adminRepo.listTemplates();
    return { templates };
  });

  // ── Broadcast ─────────────────────────────────────────────────

  server.post("/internal/admin/notifications/broadcast", async (req, reply) => {
    const adminId = requireAdminServiceToken(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SendBroadcastRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const broadcast = await adminRepo.createBroadcast({ ...parsed.data, sentBy: adminId });

    const recipientCount = estimateRecipientCount(parsed.data.audience);
    await adminRepo.updateBroadcastStatus(broadcast.id, "sent", recipientCount);

    if (eventRepo && parsed.data.audience.startsWith("user:")) {
      const targetUserId = parsed.data.audience.slice("user:".length);
      await eventRepo.pushEvent({
        eventId: randomUUID(),
        eventType: "partner_entrant_message_sent",
        occurredAt: new Date().toISOString(),
        actorUserId: adminId,
        targetUserId,
        resourceType: "system",
        resourceId: broadcast.id,
        payload: { subject: parsed.data.subject, body: parsed.data.body },
      });
    }

    return reply.status(201).send({
      broadcast: {
        ...broadcast,
        status: "sent" as const,
        recipientCount,
        sentAt: new Date().toISOString()
      }
    });
  });

  // ── Direct Notification ───────────────────────────────────────

  server.post("/internal/admin/notifications/direct", async (req, reply) => {
    const adminId = requireAdminServiceToken(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SendDirectNotificationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const broadcast = await adminRepo.createBroadcast({
      subject: parsed.data.subject,
      body: parsed.data.body,
      audience: `user:${parsed.data.userId}`,
      sentBy: adminId
    });

    await adminRepo.updateBroadcastStatus(broadcast.id, "sent", 1);

    if (eventRepo) {
      await eventRepo.pushEvent({
        eventId: randomUUID(),
        eventType: "partner_entrant_message_sent",
        occurredAt: new Date().toISOString(),
        actorUserId: adminId,
        targetUserId: parsed.data.userId,
        resourceType: "system",
        resourceId: broadcast.id,
        payload: { subject: parsed.data.subject, body: parsed.data.body },
      });
    }

    return reply.status(201).send({
      broadcast: {
        ...broadcast,
        status: "sent" as const,
        audience: `user:${parsed.data.userId}`,
        recipientCount: 1,
        sentAt: new Date().toISOString()
      }
    });
  });

  // ── History ───────────────────────────────────────────────────

  server.get("/internal/admin/notifications/history", async (req, reply) => {
    const adminId = requireAdminServiceToken(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = NotificationHistoryRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await adminRepo.listBroadcasts({
      status: parsed.data.status,
      page: parsed.data.page,
      limit: parsed.data.limit
    });

    return {
      broadcasts: result.broadcasts,
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit
    };
  });
}
