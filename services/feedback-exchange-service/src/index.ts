import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  FeedbackListingCreateRequestSchema,
  FeedbackListingFiltersSchema,
  FeedbackReviewSubmitRequestSchema,
  ReviewerRatingCreateRequestSchema,
  FeedbackDisputeCreateRequestSchema,
  FeedbackDisputeResolveRequestSchema
} from "@script-manifest/contracts";
import { publishNotificationEvent } from "./notificationPublisher.js";
import {
  type FeedbackExchangeRepository,
  PgFeedbackExchangeRepository
} from "./repository.js";

type PublishNotificationEvent = typeof publishNotificationEvent;

export type FeedbackExchangeServiceOptions = {
  logger?: boolean;
  publisher?: PublishNotificationEvent;
  repository?: FeedbackExchangeRepository;
};

const SYSTEM_USER_ID = "SYSTEM";

export function buildServer(options: FeedbackExchangeServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });
  const publisher = options.publisher ?? publishNotificationEvent;
  const repository = options.repository ?? new PgFeedbackExchangeRepository();

  const getAuthUserId = (headers: Record<string, unknown>): string | null => {
    const userId = headers["x-auth-user-id"];
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  };

  server.addHook("onReady", async () => {
    await repository.init();
  });

  // ── Health ─────────────────────────────────────────────────────────

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "feedback-exchange-service", ok, checks });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await repository.healthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "feedback-exchange-service", ok, checks });
  });

  // ── Token Economy ──────────────────────────────────────────────────

  server.get("/internal/tokens/:userId/balance", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const balance = await repository.getBalance(userId);
    return reply.send({ userId, balance });
  });

  server.get("/internal/tokens/:userId/transactions", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const transactions = await repository.listTransactions(userId);
    return reply.send({ transactions });
  });

  server.post("/internal/tokens/grant-signup", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const transaction = await repository.ensureSignupGrant(authUserId);
    return reply.status(201).send({ transaction });
  });

  // ── Listings ───────────────────────────────────────────────────────

  server.post("/internal/listings", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = FeedbackListingCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const balance = await repository.getBalance(authUserId);
    if (balance < 1) {
      return reply.status(402).send({ error: "insufficient_tokens", balance });
    }

    // Debit 1 token for listing fee
    const idempotencyKey = `listing_fee_${authUserId}_${Date.now()}`;
    await repository.createTransaction({
      idempotencyKey,
      debitUserId: authUserId,
      creditUserId: SYSTEM_USER_ID,
      amount: 1,
      reason: "listing_fee",
      referenceType: "listing",
      referenceId: ""
    });

    const listing = await repository.createListing(authUserId, parsed.data);

    return reply.status(201).send({ listing });
  });

  server.get("/internal/listings", async (req, reply) => {
    const parsed = FeedbackListingFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }
    const listings = await repository.listListings(parsed.data);
    return reply.send({ listings });
  });

  server.get("/internal/listings/:listingId", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    const listing = await repository.getListing(listingId);
    if (!listing) {
      return reply.status(404).send({ error: "listing_not_found" });
    }
    return reply.send({ listing });
  });

  server.post("/internal/listings/:listingId/claim", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const listing = await repository.getListing(listingId);
    if (!listing) {
      return reply.status(404).send({ error: "listing_not_found" });
    }
    if (listing.status !== "open") {
      return reply.status(409).send({ error: "listing_not_available" });
    }
    if (listing.ownerUserId === authUserId) {
      return reply.status(400).send({ error: "cannot_review_own_listing" });
    }

    const suspended = await repository.isSuspended(authUserId);
    if (suspended) {
      return reply.status(403).send({ error: "reviewer_suspended" });
    }

    const result = await repository.claimListing(listingId, authUserId);
    if (!result) {
      return reply.status(409).send({ error: "listing_not_available" });
    }

    try {
      await publisher({
        eventId: randomUUID(),
        eventType: "feedback_listing_claimed",
        occurredAt: new Date().toISOString(),
        actorUserId: authUserId,
        targetUserId: listing.ownerUserId,
        resourceType: "feedback_listing",
        resourceId: listingId,
        payload: { reviewId: result.review.id }
      });
    } catch (error) {
      server.log.warn({ error }, "failed to publish listing claimed event");
    }

    return reply.status(201).send(result);
  });

  server.post("/internal/listings/:listingId/cancel", async (req, reply) => {
    const { listingId } = req.params as { listingId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const listing = await repository.getListing(listingId);
    if (!listing) {
      return reply.status(404).send({ error: "listing_not_found" });
    }
    if (listing.ownerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (listing.status !== "open") {
      return reply.status(409).send({ error: "listing_not_cancellable" });
    }

    const cancelled = await repository.cancelListing(listingId, authUserId);
    if (!cancelled) {
      return reply.status(409).send({ error: "listing_not_cancellable" });
    }

    // Refund the listing fee
    await repository.createTransaction({
      idempotencyKey: `cancel_refund_${listingId}`,
      debitUserId: SYSTEM_USER_ID,
      creditUserId: authUserId,
      amount: 1,
      reason: "dispute_refund",
      referenceType: "listing",
      referenceId: listingId
    });

    return reply.send({ listing: cancelled });
  });

  // ── Reviews ────────────────────────────────────────────────────────

  server.get("/internal/reviews/:reviewId", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await repository.getReview(reviewId);
    if (!review) {
      return reply.status(404).send({ error: "review_not_found" });
    }
    return reply.send({ review });
  });

  server.post("/internal/reviews/:reviewId/submit", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const review = await repository.getReview(reviewId);
    if (!review) {
      return reply.status(404).send({ error: "review_not_found" });
    }
    if (review.reviewerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = FeedbackReviewSubmitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const submitted = await repository.submitReview(reviewId, parsed.data);
    if (!submitted) {
      return reply.status(409).send({ error: "review_not_submittable" });
    }

    // Credit 1 token to the reviewer
    await repository.createTransaction({
      idempotencyKey: `review_reward_${reviewId}`,
      debitUserId: SYSTEM_USER_ID,
      creditUserId: authUserId,
      amount: 1,
      reason: "review_reward",
      referenceType: "review",
      referenceId: reviewId
    });

    // Mark listing as completed
    const listing = await repository.getListing(review.listingId);

    try {
      if (listing) {
        await publisher({
          eventId: randomUUID(),
          eventType: "feedback_review_submitted",
          occurredAt: new Date().toISOString(),
          actorUserId: authUserId,
          targetUserId: listing.ownerUserId,
          resourceType: "feedback_review",
          resourceId: reviewId,
          payload: { listingId: listing.id }
        });
      }
    } catch (error) {
      server.log.warn({ error }, "failed to publish review submitted event");
    }

    return reply.send({ review: submitted });
  });

  // ── Ratings ────────────────────────────────────────────────────────

  server.post("/internal/reviews/:reviewId/rate", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const review = await repository.getReview(reviewId);
    if (!review) {
      return reply.status(404).send({ error: "review_not_found" });
    }
    if (review.status !== "submitted") {
      return reply.status(409).send({ error: "review_not_submitted" });
    }

    // Only the listing owner can rate
    const listing = await repository.getListing(review.listingId);
    if (!listing || listing.ownerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = ReviewerRatingCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const rating = await repository.createRating(reviewId, authUserId, parsed.data.score, parsed.data.comment);
    if (!rating) {
      return reply.status(409).send({ error: "already_rated" });
    }

    // Auto-strike if rating <= 2
    if (parsed.data.score <= 2) {
      await repository.issueStrike(review.reviewerUserId, `Low rating (${parsed.data.score}/5) on review ${reviewId}`);
      const strikeCount = await repository.getActiveStrikeCount(review.reviewerUserId);
      if (strikeCount >= 3) {
        await repository.suspendReviewer(review.reviewerUserId);
      }
    }

    return reply.status(201).send({ rating });
  });

  server.get("/internal/reviews/:reviewId/rating", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const rating = await repository.getRatingByReview(reviewId);
    if (!rating) {
      return reply.status(404).send({ error: "rating_not_found" });
    }
    return reply.send({ rating });
  });

  // ── Reputation ─────────────────────────────────────────────────────

  server.get("/internal/reputation/:userId", async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const reputation = await repository.getReputation(userId);
    return reply.send({ reputation });
  });

  // ── Disputes ───────────────────────────────────────────────────────

  server.post("/internal/reviews/:reviewId/dispute", async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const review = await repository.getReview(reviewId);
    if (!review) {
      return reply.status(404).send({ error: "review_not_found" });
    }

    const listing = await repository.getListing(review.listingId);
    if (!listing) {
      return reply.status(404).send({ error: "listing_not_found" });
    }

    // Either party can file a dispute
    if (authUserId !== listing.ownerUserId && authUserId !== review.reviewerUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = FeedbackDisputeCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const dispute = await repository.createDispute(reviewId, authUserId, parsed.data.reason);
    if (!dispute) {
      return reply.status(409).send({ error: "dispute_already_exists" });
    }

    const targetUserId = authUserId === listing.ownerUserId ? review.reviewerUserId : listing.ownerUserId;
    try {
      await publisher({
        eventId: randomUUID(),
        eventType: "feedback_dispute_opened",
        occurredAt: new Date().toISOString(),
        actorUserId: authUserId,
        targetUserId,
        resourceType: "feedback_dispute",
        resourceId: dispute.id,
        payload: { reviewId }
      });
    } catch (error) {
      server.log.warn({ error }, "failed to publish dispute opened event");
    }

    return reply.status(201).send({ dispute });
  });

  server.get("/internal/disputes", async (req, reply) => {
    const { status } = req.query as { status?: string };
    const validStatuses = ["open", "under_review", "resolved_for_filer", "resolved_for_reviewer", "dismissed"];
    const filterStatus = status && validStatuses.includes(status)
      ? status as Parameters<typeof repository.listDisputes>[0]
      : undefined;
    const disputes = await repository.listDisputes(filterStatus);
    return reply.send({ disputes });
  });

  server.get("/internal/disputes/:disputeId", async (req, reply) => {
    const { disputeId } = req.params as { disputeId: string };
    const dispute = await repository.getDispute(disputeId);
    if (!dispute) {
      return reply.status(404).send({ error: "dispute_not_found" });
    }
    return reply.send({ dispute });
  });

  server.post("/internal/disputes/:disputeId/resolve", async (req, reply) => {
    const { disputeId } = req.params as { disputeId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = FeedbackDisputeResolveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const dispute = await repository.getDispute(disputeId);
    if (!dispute) {
      return reply.status(404).send({ error: "dispute_not_found" });
    }

    const resolved = await repository.resolveDispute(disputeId, authUserId, parsed.data.status, parsed.data.resolutionNote);
    if (!resolved) {
      return reply.status(409).send({ error: "dispute_not_resolvable" });
    }

    // If resolved for filer: strike reviewer + refund token
    if (parsed.data.status === "resolved_for_filer") {
      const review = await repository.getReview(dispute.reviewId);
      if (review) {
        await repository.issueStrike(review.reviewerUserId, `Dispute ${disputeId} resolved against reviewer`);
        const strikeCount = await repository.getActiveStrikeCount(review.reviewerUserId);
        if (strikeCount >= 3) {
          await repository.suspendReviewer(review.reviewerUserId);
        }

        const listing = await repository.getListing(review.listingId);
        if (listing) {
          await repository.createTransaction({
            idempotencyKey: `dispute_refund_${disputeId}`,
            debitUserId: SYSTEM_USER_ID,
            creditUserId: listing.ownerUserId,
            amount: 1,
            reason: "dispute_refund",
            referenceType: "dispute",
            referenceId: disputeId
          });
        }
      }
    }

    return reply.send({ dispute: resolved });
  });

  // ── Maintenance ────────────────────────────────────────────────────

  server.post("/internal/maintenance/expire-listings", async (_req, reply) => {
    const count = await repository.expireStaleListings();
    return reply.send({ expired: count });
  });

  server.post("/internal/maintenance/expire-reviews", async (_req, reply) => {
    const count = await repository.expireOverdueReviews();
    return reply.send({ expired: count });
  });

  server.post("/internal/maintenance/decay-strikes", async (_req, reply) => {
    const count = await repository.decayExpiredStrikes();
    return reply.send({ decayed: count });
  });

  return server;
}

function warnMissingEnv(recommended: string[]): void {
  const missing = recommended.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[feedback-exchange-service] Missing recommended env vars: ${missing.join(", ")}`);
  }
}

export async function startServer(): Promise<void> {
  warnMissingEnv(["DATABASE_URL"]);
  const port = Number(process.env.PORT ?? 4006);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
