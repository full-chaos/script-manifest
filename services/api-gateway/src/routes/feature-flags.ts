import type { FastifyInstance } from "fastify";
import {
  CreateFeatureFlagRequestSchema,
  UpdateFeatureFlagRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminByRole
} from "../helpers.js";

export function registerFeatureFlagRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Admin: List flags ──────────────────────────────────────────

  server.get("/api/v1/admin/feature-flags", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/feature-flags`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Admin: Create flag ─────────────────────────────────────────

  server.post("/api/v1/admin/feature-flags", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = CreateFeatureFlagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/feature-flags`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Admin: Update flag ─────────────────────────────────────────

  server.put<{ Params: { key: string } }>("/api/v1/admin/feature-flags/:key", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    const parsed = UpdateFeatureFlagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/feature-flags/${encodeURIComponent(req.params.key)}`,
      {
        method: "PUT",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId, "admin"),
        body: JSON.stringify(parsed.data)
      },
      req.id
    );
  });

  // ── Admin: Delete flag ─────────────────────────────────────────

  server.delete<{ Params: { key: string } }>("/api/v1/admin/feature-flags/:key", async (req, reply) => {
    const adminId = await resolveAdminByRole(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers as Record<string, unknown>,
      req.log
    );
    if (!adminId) return reply.status(403).send({ error: "forbidden" });

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/admin/feature-flags/${encodeURIComponent(req.params.key)}`,
      { method: "DELETE", headers: addAuthUserIdHeader({}, adminId, "admin") },
      req.id
    );
  });

  // ── Client: Evaluate flags ─────────────────────────────────────

  server.get("/api/v1/feature-flags", async (req, reply) => {
    const userId = await getUserIdFromAuth(
      ctx.requestFn, ctx.identityServiceBase,
      req.headers.authorization, req.log
    );

    const headers: Record<string, string> = {};
    if (userId) {
      headers["x-auth-user-id"] = userId;
    }

    return proxyJsonRequest(
      reply, ctx.requestFn,
      `${ctx.identityServiceBase}/internal/feature-flags`,
      { method: "GET", headers },
      req.id
    );
  });
}
