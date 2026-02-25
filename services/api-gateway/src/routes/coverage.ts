import type { FastifyInstance } from "fastify";
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
  server.post("/api/v1/coverage/providers", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/providers", async (req, reply) => {
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers${qs}`,
      { method: "GET" }
    );
  });

  server.get("/api/v1/coverage/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}`,
      { method: "GET" }
    );
  });

  server.patch("/api/v1/coverage/providers/:providerId", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/providers/:providerId/stripe-onboarding", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/stripe-onboarding`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/admin/providers/review-queue", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/admin/providers/review-queue`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.post("/api/v1/coverage/admin/providers/:providerId/review", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/admin/providers/${encodeURIComponent(providerId)}/review`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/providers/:providerId/earnings-statement", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params as { providerId: string };
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/earnings-statement${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Service routes
  server.post("/api/v1/coverage/providers/:providerId/services", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/services`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
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

  server.patch("/api/v1/coverage/services/:serviceId", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { serviceId } = req.params as { serviceId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/services/${encodeURIComponent(serviceId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  // Order routes
  server.post("/api/v1/coverage/orders", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/orders", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.get("/api/v1/coverage/orders/:orderId", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params as { orderId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Order action routes (claim, deliver, complete, cancel)
  for (const action of ["claim", "deliver", "complete", "cancel"] as const) {
    server.post(`/api/v1/coverage/orders/:orderId/${action}`, async (req, reply) => {
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
      if (!userId) return reply.status(401).send({ error: "unauthorized" });
      const { orderId } = req.params as { orderId: string };
      const hasBody = action === "deliver";
      return proxyJsonRequest(reply, ctx.requestFn,
        `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/${action}`,
        {
          method: "POST",
          headers: addAuthUserIdHeader(hasBody ? { "content-type": "application/json" } : {}, userId),
          body: hasBody ? JSON.stringify(req.body ?? {}) : undefined
        }
      );
    });
  }

  // Delivery route
  server.get("/api/v1/coverage/orders/:orderId/delivery", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params as { orderId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/delivery`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/orders/:orderId/delivery/upload-url", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params as { orderId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/delivery/upload-url`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  // Review routes
  server.post("/api/v1/coverage/orders/:orderId/review", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params as { orderId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/review`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/providers/:providerId/reviews", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/providers/${encodeURIComponent(providerId)}/reviews`,
      { method: "GET" }
    );
  });

  // Dispute routes
  server.post("/api/v1/coverage/orders/:orderId/dispute", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });
    const { orderId } = req.params as { orderId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/orders/${encodeURIComponent(orderId)}/dispute`,
      { method: "POST", headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  server.get("/api/v1/coverage/disputes", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const qs = buildQuerySuffix(req.query);
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes${qs}`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  server.patch("/api/v1/coverage/disputes/:disputeId", async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { disputeId } = req.params as { disputeId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes/${encodeURIComponent(disputeId)}`,
      { method: "PATCH", headers: addAuthUserIdHeader({ "content-type": "application/json" }, adminId), body: JSON.stringify(req.body ?? {}) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/disputes/:disputeId/events", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    const { disputeId } = req.params as { disputeId: string };
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/disputes/${encodeURIComponent(disputeId)}/events`,
      { method: "GET", headers: addAuthUserIdHeader({}, adminId) }
    );
  });

  // lgtm [js/missing-rate-limiting] Fastify route-level limiter config is applied below.
  server.get("/api/v1/coverage/admin/payout-ledger", {
    config: { rateLimit: { max: 15, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
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
    const adminId = await resolveAdminUserId(ctx.requestFn, ctx.identityServiceBase, req.headers, ctx.coverageAdminAllowlist);
    if (!adminId) return reply.status(403).send({ error: "forbidden" });
    return proxyJsonRequest(reply, ctx.requestFn,
      `${ctx.coverageMarketplaceBase}/internal/jobs/sla-maintenance`,
      { method: "POST", headers: addAuthUserIdHeader({}, adminId) }
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
}
