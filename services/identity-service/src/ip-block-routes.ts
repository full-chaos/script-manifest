import type { FastifyInstance } from "fastify";
import { AddIpBlockRequestSchema, IpBlockListRequestSchema } from "@script-manifest/contracts";
import { verifyServiceToken } from "@script-manifest/service-utils";
import type { IpBlockRepository } from "./ip-block-repository.js";
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

export function registerIpBlockRoutes(
  server: FastifyInstance,
  ipBlockRepo: IpBlockRepository,
  adminRepo: AdminRepository
): void {
  // ── List Blocked IPs ───────────────────────────────────────────

  server.get("/internal/admin/ip-blocks", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = IpBlockListRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await ipBlockRepo.listBlocks(
      parsed.data.page,
      parsed.data.limit,
      parsed.data.includeExpired
    );

    return reply.send({
      blocks: result.blocks,
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit
    });
  });

  // ── Add IP Block ───────────────────────────────────────────────

  server.post("/internal/admin/ip-blocks", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AddIpBlockRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const block = await ipBlockRepo.addBlock(
      parsed.data.ipAddress,
      parsed.data.reason,
      adminId,
      parsed.data.expiresInHours
    );

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "add_ip_block",
      targetType: "ip",
      targetId: parsed.data.ipAddress,
      details: {
        blockId: block.id,
        reason: parsed.data.reason,
        expiresInHours: parsed.data.expiresInHours ?? null
      }
    });

    return reply.status(201).send({ block });
  });

  // ── Remove IP Block ───────────────────────────────────────────

  server.delete<{ Params: { id: string } }>("/internal/admin/ip-blocks/:id", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const removed = await ipBlockRepo.removeBlock(req.params.id);
    if (!removed) {
      return reply.status(404).send({ error: "block_not_found" });
    }

    // Audit log
    await adminRepo.createAuditLogEntry({
      adminUserId: adminId,
      action: "remove_ip_block",
      targetType: "ip_block",
      targetId: req.params.id,
      details: {}
    });

    return reply.send({ ok: true });
  });

  // ── Check if IP is Blocked ────────────────────────────────────

  server.get<{ Params: { ip: string } }>("/internal/admin/ip-blocks/check/:ip", async (req, reply) => {
    const adminId = requireAdmin(req.headers as Record<string, unknown>);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const blocked = await ipBlockRepo.isBlocked(req.params.ip);
    return reply.send({ blocked });
  });
}
