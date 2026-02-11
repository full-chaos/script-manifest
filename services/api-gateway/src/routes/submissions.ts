import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerSubmissionRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/submissions", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/submissions${querySuffix}`,
      {
        method: "GET"
      }
    );
  });

  server.post("/api/v1/submissions", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);

    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/submissions`, {
      method: "POST",
      headers: addAuthUserIdHeader(
        { "content-type": "application/json" },
        userId
      ),
      body: JSON.stringify(req.body ?? {})
    });
  });

  server.patch("/api/v1/submissions/:submissionId/project", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/submissions/${encodeURIComponent(submissionId)}/project`,
      {
        method: "PATCH",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/placements", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/placements${querySuffix}`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.get("/api/v1/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/submissions/${encodeURIComponent(submissionId)}/placements`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.post("/api/v1/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/submissions/${encodeURIComponent(submissionId)}/placements`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/placements/:placementId", async (req, reply) => {
    const { placementId } = req.params as { placementId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.post("/api/v1/placements/:placementId/verify", async (req, reply) => {
    const { placementId } = req.params as { placementId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}/verify`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });
}
