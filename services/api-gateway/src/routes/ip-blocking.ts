import type { FastifyInstance } from "fastify";
import { AddIpBlockRequestSchema } from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerIpBlockingRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── List Blocked IPs ───────────────────────────────────────────

  server.get("/api/v1/admin/ip-blocks", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/ip-blocks${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Add IP Block ───────────────────────────────────────────────

  server.post("/api/v1/admin/ip-blocks", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = AddIpBlockRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/ip-blocks`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Remove IP Block ───────────────────────────────────────────

  server.delete<{ Params: { id: string } }>("/api/v1/admin/ip-blocks/:id", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/ip-blocks/${encodeURIComponent(req.params.id)}`,
      {
        method: "DELETE",
        headers: addAuthUserIdHeader({}, adminId, "admin")
      },
      req.id
    );
  });
}
