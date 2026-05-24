import type { FastifyInstance } from "fastify";
import {
  CreateHistoricalPlacementRequestSchema,
  CreatePlacementEvidenceItemSchema,
  PlacementCreateRequestSchema,
  PlacementVerificationUpdateRequestSchema,
  SubmissionCreateRequestSchema,
  SubmissionProjectReassignmentRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminByRole
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
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = SubmissionCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/submissions`, {
      method: "POST",
      headers: addAuthUserIdHeader(
        { "content-type": "application/json" },
        userId
      ),
      body: JSON.stringify(parsed.data)
    });
  });

  server.patch<{ Params: { submissionId: string } }>("/api/v1/submissions/:submissionId/project", async (req, reply) => {
    const { submissionId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = SubmissionProjectReassignmentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

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
        body: JSON.stringify(parsed.data)
      }
    );
  });

  server.get("/api/v1/placements", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
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

  server.get<{ Params: { submissionId: string } }>("/api/v1/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
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

  server.post<{ Params: { submissionId: string } }>("/api/v1/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = PlacementCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    const result = await proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/submissions/${encodeURIComponent(submissionId)}/placements`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(parsed.data)
      }
    );

    if (reply.statusCode < 400 && userId) {
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/recompute/incremental`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerId: userId })
      }).catch((err) => { req.log.warn({ err, writerId: userId }, "background ranking recompute failed"); });
    }

    return result;
  });

  server.post("/api/v1/placements/historical", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = CreateHistoricalPlacementRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const result = await proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/placements/historical`, {
      method: "POST",
      headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
      body: JSON.stringify(parsed.data)
    });

    if (reply.statusCode < 400 && userId) {
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/recompute/incremental`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerId: userId })
      }).catch((err) => { req.log.warn({ err, writerId: userId }, "background ranking recompute failed"); });
    }

    return result;
  });

  server.get<{ Params: { placementId: string } }>("/api/v1/placements/:placementId", async (req, reply) => {
    const { placementId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
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

  server.get<{ Params: { placementId: string } }>("/api/v1/placements/:placementId/evidence", async (req, reply) => {
    const { placementId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}/evidence`, {
      method: "GET",
      headers: addAuthUserIdHeader({}, userId)
    });
  });

  server.post<{ Params: { placementId: string } }>("/api/v1/placements/:placementId/evidence", async (req, reply) => {
    const { placementId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = CreatePlacementEvidenceItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn, `${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}/evidence`, {
      method: "POST",
      headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
      body: JSON.stringify(parsed.data)
    });
  });

  server.post<{ Params: { placementId: string } }>("/api/v1/placements/:placementId/verify", async (req, reply) => {
    const { placementId } = req.params;
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = PlacementVerificationUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }
    const placementResponse = await ctx.requestFn(`${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}`, {
      method: "GET",
      headers: addAuthUserIdHeader({}, userId)
    });
    if (placementResponse.statusCode === 404) {
      return reply.status(404).send({ error: "placement_not_found" });
    }
    if (placementResponse.statusCode >= 400) {
      return reply.status(placementResponse.statusCode).send(await placementResponse.body.json());
    }
    const placementPayload = (await placementResponse.body.json()) as { placement?: { isHistorical?: boolean } };
    let reviewerUserId = userId;
    if (placementPayload.placement?.isHistorical) {
      reviewerUserId = await resolveAdminByRole(ctx.requestFn, ctx.identityServiceBase, req.headers as Record<string, unknown>, req.log);
      if (!reviewerUserId) return reply.status(403).send({ error: "forbidden" });
    }

    const result = await proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.submissionTrackingBase}/internal/placements/${encodeURIComponent(placementId)}/verify`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, reviewerUserId, placementPayload.placement?.isHistorical ? "admin" : "writer"),
        body: JSON.stringify({
          ...parsed.data,
          reviewedByUserId: parsed.data.reviewedByUserId ?? reviewerUserId ?? undefined
        })
      }
    );

    if (reply.statusCode < 400 && userId) {
      ctx.requestFn(`${ctx.rankingServiceBase}/internal/recompute/incremental`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerId: userId })
      }).catch((err) => { req.log.warn({ err, writerId: userId }, "background ranking recompute failed"); });
    }

    return result;
  });
}
