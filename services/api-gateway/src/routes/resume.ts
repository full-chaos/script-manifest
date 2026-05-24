import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { ResumePageViewCreateRequestSchema } from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerResumeRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get<{ Params: { writerIdOrCustomUrl: string } }>("/api/v1/writers/:writerIdOrCustomUrl/resume", async (req, reply) => {
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/writers/${encodeURIComponent(req.params.writerIdOrCustomUrl)}/resume`,
      { method: "GET" }
    );
  });

  server.post<{ Params: { writerId: string } }>("/api/v1/writers/:writerId/resume-views", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      const userAgent = req.headers["user-agent"] ?? "unknown";
      const forwardedFor = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwardedFor) ? forwardedFor[0] ?? req.ip : forwardedFor?.split(",")[0]?.trim() ?? req.ip;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const parsed = ResumePageViewCreateRequestSchema.safeParse({
        ...body,
        viewerUserId: userId ?? undefined,
        userAgentHash: sha1(String(userAgent)),
        ipHash: sha1(ip),
        referrer: req.headers.referer ?? req.headers.referrer
      });
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.profileServiceBase}/internal/writers/${encodeURIComponent(req.params.writerId)}/resume-views`,
        {
          method: "POST",
          headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
          body: JSON.stringify(parsed.data)
        }
      );
    }
  });

  server.get("/api/v1/writers/me/resume-metrics", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/writers/${encodeURIComponent(userId)}/resume-metrics`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
