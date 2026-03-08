import type { FastifyInstance } from "fastify";
import { SuspendUserRequestSchema } from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerSuspensionRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Suspend User ────────────────────────────────────────────────

  server.post<{ Params: { id: string } }>("/api/v1/admin/users/:id/suspend", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SuspendUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}/suspend`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Ban User ───────────────────────────────────────────────────

  server.post<{ Params: { id: string } }>("/api/v1/admin/users/:id/ban", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = SuspendUserRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}/ban`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Unsuspend User ─────────────────────────────────────────────

  server.post<{ Params: { id: string } }>("/api/v1/admin/users/:id/unsuspend", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}/unsuspend`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({}, adminId, "admin")
      },
      req.id
    );
  });

  // ── Get Suspension History ─────────────────────────────────────

  server.get<{ Params: { id: string } }>("/api/v1/admin/users/:id/suspensions", async (req, reply) => {
    const adminId = await resolveAdminUserId(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      ctx.adminAllowlist, req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/users/${encodeURIComponent(req.params.id)}/suspensions`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });
}
