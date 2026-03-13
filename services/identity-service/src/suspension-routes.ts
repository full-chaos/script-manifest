import type { FastifyInstance } from "fastify";
import { SuspendUserRequestSchema } from "@script-manifest/contracts";
import type { SuspensionRepository } from "./suspension-repository.js";
import type { AdminRepository } from "./admin-repository.js";
import { requireAdmin } from "./auth-helpers.js";

export function registerSuspensionRoutes(
  server: FastifyInstance,
  suspensionRepo: SuspensionRepository,
  adminRepo: AdminRepository
): void {
  // ── Suspend User ────────────────────────────────────────────────

  server.post<{ Params: { id: string } }>("/internal/admin/users/:id/suspend", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SuspendUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const targetId = req.params.id;

    // Create suspension record
    const suspension = await suspensionRepo.suspendUser(
      targetId,
      adminId,
      parsed.data.reason,
      parsed.data.durationDays
    );

    // Update account status
    await adminRepo.updateUserStatus(targetId, "suspended");

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "suspend_user",
      targetType: "user",
      targetId,
      details: {
        suspensionId: suspension.id,
        reason: parsed.data.reason,
        durationDays: parsed.data.durationDays ?? null,
        expiresAt: suspension.expiresAt
      }
    });

    return reply.status(201).send({ suspension });
  });

  // ── Ban User (permanent) ───────────────────────────────────────

  server.post<{ Params: { id: string } }>("/internal/admin/users/:id/ban", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SuspendUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const targetId = req.params.id;

    // Create suspension record with no expiry (permanent ban)
    const suspension = await suspensionRepo.suspendUser(
      targetId,
      adminId,
      parsed.data.reason
      // no durationDays — permanent
    );

    // Update account status to banned
    await adminRepo.updateUserStatus(targetId, "banned");

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "ban_user",
      targetType: "user",
      targetId,
      details: {
        suspensionId: suspension.id,
        reason: parsed.data.reason
      }
    });

    return reply.status(201).send({ suspension });
  });

  // ── Unsuspend User ─────────────────────────────────────────────

  server.post<{ Params: { id: string } }>("/internal/admin/users/:id/unsuspend", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const targetId = req.params.id;

    // Find active suspension
    const active = await suspensionRepo.getActiveSuspension(targetId);
    if (!active) {
      return reply.status(404).send({ error: "no_active_suspension" });
    }

    // Lift the suspension
    await suspensionRepo.liftSuspension(active.id, adminId);

    // Restore account status
    await adminRepo.updateUserStatus(targetId, "active");

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "unsuspend_user",
      targetType: "user",
      targetId,
      details: {
        suspensionId: active.id,
        originalReason: active.reason
      }
    });

    return reply.send({ ok: true });
  });

  // ── Get Suspension History ─────────────────────────────────────

  server.get<{ Params: { id: string } }>("/internal/admin/users/:id/suspensions", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const suspensions = await suspensionRepo.getUserSuspensionHistory(req.params.id);
    return reply.send({ suspensions });
  });
}
