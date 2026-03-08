import type { FastifyInstance } from "fastify";
import {
  CoverageDeliveryCreateRequestSchema,
  CoverageDisputeCreateRequestSchema,
  CoverageDisputeResolveRequestSchema,
  CoverageOrderCreateRequestSchema,
  CoverageProviderCreateRequestSchema,
  CoverageProviderReviewRequestSchema,
  CoverageProviderUpdateRequestSchema,
  CoverageReviewCreateRequestSchema,
  CoverageServiceCreateRequestSchema,
  CoverageServiceUpdateRequestSchema
} from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest,
  resolveAdminUserId
} from "../helpers.js";

export function registerCoverageRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // Provider routes
  server.post("/api/v1/coverage/providers", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const parsed = CoverageProviderCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get("/api/v1/coverage/providers", async (req, reply) => {
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers${qs}`,
      { method: "GET" }
    );
  });

  server.get<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}`,
      { method: "GET" }
    );
  });

  server.patch<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params;
    const parsed = CoverageProviderUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId/stripe-onboarding", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/stripe-onboarding`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/admin/providers/review-queue", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/admin/providers/review-queue`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.post<{ Params: { providerId: string } }>("/api/v1/coverage/admin/providers/:providerId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { providerId } = req.params;
    const parsed = CoverageProviderReviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/admin/providers/${encodeURIComponent(providerId)}/review`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId),
        body: JSON.stringify(parsed.data)
      }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId/earnings-statement", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params;
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/earnings-statement${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Service routes
  server.post<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId/services", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params;
    const parsed = CoverageServiceCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/services`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/services`,
      { method: "GET" }
    );
  });

  server.get("/api/v1/coverage/services", async (req, reply) => {
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/services${qs}`,
      { method: "GET" }
    );
  });

  server.patch<{ Params: { serviceId: string } }>("/api/v1/coverage/services/:serviceId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { serviceId } = req.params;
    const parsed = CoverageServiceUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/services/${encodeURIComponent(serviceId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  // Order routes
  server.post("/api/v1/coverage/orders", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const parsed = CoverageOrderCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get("/api/v1/coverage/orders", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.get<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.post<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/retry-payment", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/coverage/orders/${encodeURIComponent(orderId)}/retry-payment`,
      { method: "POST", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Order action routes (claim, deliver, complete, cancel)
  for (const action of ["claim", "deliver", "complete", "cancel"] as const) {
    server.post<{ Params: { orderId: string } }>(`/api/v1/coverage/orders/:orderId/${action}`, {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    }, async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
      if (!userId) return reply.status(401).send({ error: "unauthorized" });
      const { orderId } = req.params;
      const hasBody = action === "deliver";
      const parsed = hasBody ? CoverageDeliveryCreateRequestSchema.safeParse(req.body) : null;
      if (parsed && !parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }
      // TODO: add validation schema
      return proxyJsonRequest(reply, ctx.requestFn,
        `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/${action}`,
        {
          method: "POST",
          headers: addAuthUserIdHeader(hasBody ? { "content-type": "application/json" } : {}, userId),
          body: parsed ? JSON.stringify(parsed.data) : undefined
        }
      );
    });
  }

  // Delivery route
  server.get<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/delivery", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/delivery`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/delivery/upload-url", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/delivery/upload-url`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Review routes
  server.post<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/review", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    const parsed = CoverageReviewCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/review`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get<{ Params: { providerId: string } }>("/api/v1/coverage/providers/:providerId/reviews", async (req, reply) => {
    const { providerId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/reviews`,
      { method: "GET" }
    );
  });

  // Dispute routes
  server.post<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/dispute", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    const parsed = CoverageDisputeCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/dispute`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(parsed.data) }
    );
  });

  server.get("/api/v1/coverage/disputes", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  server.patch<{ Params: { disputeId: string } }>("/api/v1/coverage/disputes/:disputeId", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { disputeId } = req.params;
    const parsed = CoverageDisputeResolveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes/${encodeURIComponent(disputeId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId), body: JSON.stringify(parsed.data) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get<{ Params: { disputeId: string } }>("/api/v1/coverage/disputes/:disputeId/events", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { disputeId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes/${encodeURIComponent(disputeId)}/events`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/admin/payout-ledger", {
    config: { rateLimit: { max: 15, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/admin/payout-ledger${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.post("/api/v1/coverage/admin/jobs/sla-maintenance", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist, req.log);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    // TODO: add validation schema
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/jobs/sla-maintenance`,
      { method: "POST", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // My orders (transaction history)
  server.get("/api/v1/coverage/my-orders", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/coverage/my-orders${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Invoice endpoint
  server.get<{ Params: { orderId: string } }>("/api/v1/coverage/orders/:orderId/invoice", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/coverage/orders/${encodeURIComponent(orderId)}/invoice`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Stripe webhook (no auth — Stripe signs the request)
  server.post("/api/v1/coverage/stripe-webhook", async (req, reply) => {
    const contentTypeHeader = req.headers["content-type"];
    const stripeSignatureHeader = req.headers["stripe-signature"];
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : contentTypeHeader;
    const stripeSignature = Array.isArray(stripeSignatureHeader)
      ? stripeSignatureHeader[0]
      : stripeSignatureHeader;
    const body = typeof req.body === "string" || Buffer.isBuffer(req.body)
      ? req.body
      : JSON.stringify(req.body ?? {});
    // TODO: add validation schema

    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/stripe-webhook`,
      {
        method: "POST",
        headers: {
          "content-type": contentType ?? "application/json",
          ...(stripeSignature ? { "stripe-signature": stripeSignature } : {})
        },
        body
      }
    );
  });

  // Payment method routes
  server.get("/api/v1/coverage/payment-methods", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/coverage/payment-methods`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.delete<{ Params: { id: string } }>("/api/v1/coverage/payment-methods/:id", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { id } = req.params;
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/coverage/payment-methods/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: addAuthUserIdHeader({}, userId) }
    );
  });

}
