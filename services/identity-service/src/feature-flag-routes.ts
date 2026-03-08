import type { FastifyInstance } from "fastify";
import {
  CreateFeatureFlagRequestSchema,
  UpdateFeatureFlagRequestSchema
} from "@script-manifest/contracts";
import { verifyServiceToken } from "@script-manifest/service-utils";
import type { FeatureFlagRepository } from "./feature-flag-repository.js";
import type { AdminRepository } from "./admin-repository.js";

function readAdminUserId(headers: Record<string, unknown>): string | null {
  const raw = headers["x-auth-user-id"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
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

export function registerFeatureFlagRoutes(
  server: FastifyInstance,
  flagRepo: FeatureFlagRepository,
  adminRepo: AdminRepository
): void {
  // ── Admin: List all flags ──────────────────────────────────────

  server.get("/internal/admin/feature-flags", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const flags = await flagRepo.listFlags();
    return { flags };
  });

  // ── Admin: Create flag ─────────────────────────────────────────

  server.post("/internal/admin/feature-flags", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = CreateFeatureFlagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    // Check if flag already exists
    const existing = await flagRepo.getFlagByKey(parsed.data.key);
    if (existing) {
      return reply.status(409).send({ error: "flag_already_exists" });
    }

    const flag = await flagRepo.createFlag(
      parsed.data.key,
      parsed.data.description ?? "",
      adminId
    );

    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "create_feature_flag",
      targetType: "feature_flag",
      targetId: flag.key,
      details: { description: flag.description }
    });

    return reply.status(201).send({ flag });
  });

  // ── Admin: Update flag ─────────────────────────────────────────

  server.put<{ Params: { key: string } }>("/internal/admin/feature-flags/:key", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = UpdateFeatureFlagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const updated = await flagRepo.updateFlag(req.params.key, parsed.data, adminId);
    if (!updated) {
      return reply.status(404).send({ error: "flag_not_found" });
    }

    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "update_feature_flag",
      targetType: "feature_flag",
      targetId: updated.key,
      details: parsed.data
    });

    return { flag: updated };
  });

  // ── Admin: Delete flag ─────────────────────────────────────────

  server.delete<{ Params: { key: string } }>("/internal/admin/feature-flags/:key", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const deleted = await flagRepo.deleteFlag(req.params.key);
    if (!deleted) {
      return reply.status(404).send({ error: "flag_not_found" });
    }

    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "delete_feature_flag",
      targetType: "feature_flag",
      targetId: req.params.key
    });

    return reply.status(204).send();
  });

  // ── Client: Evaluate flags ─────────────────────────────────────

  server.get("/internal/feature-flags", async (req) => {
    const userId = (req.headers as Record<string, unknown>)["x-auth-user-id"];
    const userIdStr = typeof userId === "string" && userId.length > 0 ? userId : undefined;

    const flags = await flagRepo.evaluateFlags(userIdStr);
    return { flags };
  });
}
