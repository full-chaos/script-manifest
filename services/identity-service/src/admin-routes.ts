import type { FastifyInstance } from "fastify";
import {
  AdminUserListRequestSchema,
  AdminUserUpdateRequestSchema,
  AuditLogListRequestSchema,
  ContentReportCreateRequestSchema,
  ModerationActionRequestSchema,
  ModerationQueueRequestSchema
} from "@script-manifest/contracts";
import { verifyServiceToken } from "@script-manifest/service-utils";
import type { AdminRepository } from "./admin-repository.js";

function readAdminUserId(headers: Record<string, unknown>): string | null {
  const raw = headers["x-auth-user-id"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function readUserId(headers: Record<string, unknown>): string | null {
  return readAdminUserId(headers);
}

function readServiceRole(headers: Record<string, unknown>): string | null {
  const token = headers["x-service-token"];
  if (typeof token !== "string") return null;

  const secret = process.env.SERVICE_TOKEN_SECRET;
  if (!secret) return null;

  const payload = verifyServiceToken(token, secret);
  return payload?.role ?? null;
}

function requireAdmin(headers: Record<string, unknown>): string | null {
  const role = readServiceRole(headers);
  if (role !== "admin") return null;
  return readAdminUserId(headers);
}

export function registerAdminRoutes(server: FastifyInstance, adminRepo: AdminRepository): void {
  // ── User Management ──────────────────────────────────────────

  server.get("/internal/admin/users", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AdminUserListRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await adminRepo.listUsers(parsed.data);
    return { users: result.users, total: result.total, page: parsed.data.page, limit: parsed.data.limit };
  });

  server.get<{ Params: { id: string } }>("/internal/admin/users/:id", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const user = await adminRepo.getUserById(req.params.id);
    if (!user) return reply.status(404).send({ error: "user_not_found" });

    return { user };
  });

  server.patch<{ Params: { id: string } }>("/internal/admin/users/:id", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AdminUserUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const targetId = req.params.id;

    if (parsed.data.role) {
      const ok = await adminRepo.updateUserRole(targetId, parsed.data.role);
      if (!ok) return reply.status(404).send({ error: "user_not_found" });

      await adminRepo.createAuditLogEntry({
        adminUserId: adminId,
        action: "update_role",
        targetType: "user",
        targetId,
        details: { newRole: parsed.data.role }
      });
    }

    if (parsed.data.accountStatus) {
      const ok = await adminRepo.updateUserStatus(targetId, parsed.data.accountStatus);
      if (!ok) return reply.status(404).send({ error: "user_not_found" });

      await adminRepo.createAuditLogEntry({
        adminUserId: adminId,
        action: `set_status_${parsed.data.accountStatus}`,
        targetType: "user",
        targetId,
        details: {
          newStatus: parsed.data.accountStatus,
          reason: parsed.data.suspensionReason,
          durationDays: parsed.data.suspensionDurationDays
        }
      });
    }

    const updated = await adminRepo.getUserById(targetId);
    return { user: updated };
  });

  // ── Audit Log ────────────────────────────────────────────────

  server.get("/internal/admin/audit-log", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AuditLogListRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await adminRepo.listAuditLogEntries(parsed.data);
    return { entries: result.entries, total: result.total, page: parsed.data.page, limit: parsed.data.limit };
  });

  // ── Content Reports (User-facing) ────────────────────────────

  server.post("/internal/reports", async (req, reply) => {
    const userId = readUserId(req.headers as Record<string, unknown>);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const parsed = ContentReportCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const report = await adminRepo.createContentReport(
      userId,
      parsed.data.contentType,
      parsed.data.contentId,
      parsed.data.reason,
      parsed.data.description
    );

    return reply.status(201).send({ report });
  });

  // ── Moderation Queue (Admin) ─────────────────────────────────

  server.get("/internal/admin/moderation/queue", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = ModerationQueueRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await adminRepo.listContentReports(parsed.data);
    return { reports: result.reports, total: result.total, page: parsed.data.page, limit: parsed.data.limit };
  });

  server.post<{ Params: { reportId: string } }>("/internal/admin/moderation/:reportId/action", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = ModerationActionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const report = await adminRepo.getContentReportById(req.params.reportId);
    if (!report) return reply.status(404).send({ error: "report_not_found" });

    // Content owner resolution is not yet implemented.
    // Return 501 to prevent accidentally acting on the reporter instead of the
    // content owner when the action targets a user account.
    if (parsed.data.actionType === "suspension" || parsed.data.actionType === "ban" || parsed.data.actionType === "reactivation") {
      return reply.status(501).send({ error: "content_owner_resolution_not_implemented" });
    }

    // For non-account actions (e.g. warning) we still have a target user to
    // record against — use the reporter as a placeholder until owner resolution
    // is implemented.
    const targetUserId = report.reporterId;

    // Record the moderation action
    await adminRepo.createModerationAction(
      adminId,
      targetUserId,
      parsed.data.actionType,
      parsed.data.reason,
      report.id
    );

    // Resolve the report
    const resolved = await adminRepo.resolveContentReport(
      report.id,
      adminId,
      parsed.data.reason,
      parsed.data.actionType === "warning" ? "reviewed" : "actioned"
    );

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: `moderation_${parsed.data.actionType}`,
      targetType: "user",
      targetId: targetUserId,
      details: {
        reportId: report.id,
        actionType: parsed.data.actionType,
        reason: parsed.data.reason
      }
    });

    return { report: resolved };
  });

  // ── Metrics ──────────────────────────────────────────────────

  server.get("/internal/admin/metrics", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const metrics = await adminRepo.getUserMetrics();
    return { metrics };
  });
}
