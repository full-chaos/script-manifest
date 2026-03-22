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

async function fanOutEvents(
  adminRepo: NotificationAdminRepository,
  eventRepo: NotificationRepository,
  audience: string,
  broadcastId: string,
  adminId: string,
  subject: string,
  body: string
): Promise<number> {
  const userIds = await adminRepo.getUserIdsByAudience(audience);
  const now = new Date().toISOString();
  for (const targetUserId of userIds) {
    await eventRepo.pushEvent({
      eventId: randomUUID(),
      eventType: "partner_entrant_message_sent",
      occurredAt: now,
      actorUserId: adminId,
      targetUserId,
      resourceType: "system",
      resourceId: broadcastId,
      payload: { subject, body },
    });
  }
  return userIds.length;
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

    let recipientCount = 0;
    if (eventRepo) {
      recipientCount = await fanOutEvents(
        adminRepo, eventRepo, parsed.data.audience,
        broadcast.id, adminId, parsed.data.subject, parsed.data.body
      );
    }
    await adminRepo.updateBroadcastStatus(broadcast.id, "sent", recipientCount);

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

    const audience = `user:${parsed.data.userId}`;
    const broadcast = await adminRepo.createBroadcast({
      subject: parsed.data.subject,
      body: parsed.data.body,
      audience,
      sentBy: adminId
    });

    let recipientCount = 0;
    if (eventRepo) {
      recipientCount = await fanOutEvents(
        adminRepo, eventRepo, audience,
        broadcast.id, adminId, parsed.data.subject, parsed.data.body
      );
    }
    await adminRepo.updateBroadcastStatus(broadcast.id, "sent", recipientCount);

    return reply.status(201).send({
      broadcast: {
        ...broadcast,
        status: "sent" as const,
        audience,
        recipientCount,
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
