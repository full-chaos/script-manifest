import type { FastifyInstance } from "fastify";
import { ImportCommitRequestSchema } from "@script-manifest/contracts";
import {
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  type GatewayContext
} from "../helpers.js";

export function registerCareerImportRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.addContentTypeParser(["text/csv", "application/csv"], { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  server.post("/api/v1/career-imports", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const csvBody = typeof req.body === "string" ? req.body : "";
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/career-imports${buildQuerySuffix(req.query)}`, {
      method: "POST",
      headers: addAuthUserIdHeader({ "content-type": "text/csv" }, userId),
      body: csvBody
    });
  });

  server.get<{ Params: { batchId: string } }>("/api/v1/career-imports/:batchId", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/career-imports/${encodeURIComponent(req.params.batchId)}`, {
      method: "GET",
      headers: addAuthUserIdHeader({}, userId)
    });
  });

  server.post<{ Params: { batchId: string } }>("/api/v1/career-imports/:batchId/commit", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const requestBody = req.body && typeof req.body === "object" ? req.body : {};
    const parsed = ImportCommitRequestSchema.safeParse({ ...requestBody, batchId: req.params.batchId });
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/career-imports/${encodeURIComponent(req.params.batchId)}/commit`, {
      method: "POST",
      headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
      body: JSON.stringify(parsed.data)
    });

    if (reply.statusCode < 400) {
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/recompute/incremental`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerId: userId })
      }).catch((err) => { req.log.warn({ err, writerId: userId }, "background ranking recompute failed"); });
    }

    return result;
  });
}
