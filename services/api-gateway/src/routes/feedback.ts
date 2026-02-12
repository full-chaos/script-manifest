import type { FastifyInstance } from "fastify";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  buildQuerySuffix,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerFeedbackRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Tokens ─────────────────────────────────────────────────────────

  server.get("/api/v1/feedback/tokens/balance", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/tokens/${encodeURIComponent(userId)}/balance`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.get("/api/v1/feedback/tokens/transactions", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/tokens/${encodeURIComponent(userId)}/transactions`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.post("/api/v1/feedback/tokens/grant-signup", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/tokens/grant-signup`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  // ── Listings ───────────────────────────────────────────────────────

  server.post("/api/v1/feedback/listings", async (req, reply) => {
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/listings`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/feedback/listings", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/listings${querySuffix}`,
      { method: "GET" }
    );
  });

  server.get("/api/v1/feedback/listings/:listingId", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/listings/${encodeURIComponent(listingId)}`,
      { method: "GET" }
    );
  });

  server.post("/api/v1/feedback/listings/:listingId/claim", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/listings/${encodeURIComponent(listingId)}/claim`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.post("/api/v1/feedback/listings/:listingId/cancel", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/listings/${encodeURIComponent(listingId)}/cancel`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  // ── Reviews ────────────────────────────────────────────────────────

  server.get("/api/v1/feedback/reviews/:reviewId", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reviews/${encodeURIComponent(reviewId)}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.post("/api/v1/feedback/reviews/:reviewId/submit", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reviews/${encodeURIComponent(reviewId)}/submit`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.post("/api/v1/feedback/reviews/:reviewId/rate", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reviews/${encodeURIComponent(reviewId)}/rate`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  server.get("/api/v1/feedback/reviews/:reviewId/rating", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reviews/${encodeURIComponent(reviewId)}/rating`,
      { method: "GET" }
    );
  });

  server.post("/api/v1/feedback/reviews/:reviewId/dispute", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reviews/${encodeURIComponent(reviewId)}/dispute`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });

  // ── Reputation ─────────────────────────────────────────────────────

  server.get("/api/v1/feedback/reputation/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/reputation/${encodeURIComponent(userId)}`,
      { method: "GET" }
    );
  });

  // ── Disputes (admin) ───────────────────────────────────────────────

  server.get("/api/v1/feedback/disputes", async (req, reply) => {
    const querySuffix = buildQuerySuffix(req.query);
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/disputes${querySuffix}`,
      { method: "GET", headers: addAuthUserIdHeader({}, userId) }
    );
  });

  server.post("/api/v1/feedback/disputes/:disputeId/resolve", async (req, reply) => {
    const { disputeId } = req.params as { disputeId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization);
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.feedbackExchangeBase}/internal/disputes/${encodeURIComponent(disputeId)}/resolve`,
      {
        method: "POST",
        headers: addAuthUserIdHeader({ "content-type": "application/json" }, userId),
        body: JSON.stringify(req.body ?? {})
      }
    );
  });
}
