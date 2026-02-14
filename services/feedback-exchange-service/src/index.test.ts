import assert from "node:assert/strict";
import test from "node:test";
import type {
  FeedbackDispute,
  FeedbackDisputeStatus,
  FeedbackListing,
  FeedbackListingFilters,
  FeedbackReview,
  FeedbackReviewSubmitRequest,
  NotificationEventEnvelope,
  ReviewerRating,
  ReviewerReputation,
  TokenTransaction,
  TokenTransactionReason
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { FeedbackExchangeRepository } from "./repository.js";

class MemoryFeedbackExchangeRepository implements FeedbackExchangeRepository {
  private transactions: TokenTransaction[] = [];
  private listings = new Map<string, FeedbackListing>();
  private reviews = new Map<string, FeedbackReview>();
  private ratings = new Map<string, ReviewerRating>();
  private strikes = new Map<string, { userId: string; reason: string; active: boolean; expiresAt: Date }[]>();
  private suspensions = new Set<string>();
  private disputes = new Map<string, FeedbackDispute>();
  private nextId = 1;

  async init() {}
  async healthCheck() {
    return { database: true };
  }

  private id(prefix: string) {
    return `${prefix}_${String(this.nextId++)}`;
  }

  // Tokens
  async getBalance(userId: string): Promise<number> {
    let credits = 0;
    let debits = 0;
    for (const txn of this.transactions) {
      if (txn.creditUserId === userId) credits += txn.amount;
      if (txn.debitUserId === userId) debits += txn.amount;
    }
    return credits - debits;
  }

  async createTransaction(params: {
    idempotencyKey: string; debitUserId: string; creditUserId: string;
    amount: number; reason: TokenTransactionReason; referenceType?: string; referenceId?: string;
  }): Promise<TokenTransaction> {
    const existing = this.transactions.find((t) => t.idempotencyKey === params.idempotencyKey);
    if (existing) return existing;
    const txn: TokenTransaction = {
      id: this.id("txn"),
      idempotencyKey: params.idempotencyKey,
      debitUserId: params.debitUserId,
      creditUserId: params.creditUserId,
      amount: params.amount,
      reason: params.reason,
      referenceType: params.referenceType ?? "",
      referenceId: params.referenceId ?? "",
      createdAt: new Date().toISOString()
    };
    this.transactions.push(txn);
    return txn;
  }

  async getTransactionByIdempotencyKey(key: string): Promise<TokenTransaction | null> {
    return this.transactions.find((t) => t.idempotencyKey === key) ?? null;
  }

  async listTransactions(userId: string): Promise<TokenTransaction[]> {
    return this.transactions.filter((t) => t.debitUserId === userId || t.creditUserId === userId);
  }

  async ensureSignupGrant(userId: string): Promise<TokenTransaction> {
    const key = `signup_grant_${userId}`;
    const existing = await this.getTransactionByIdempotencyKey(key);
    if (existing) return existing;
    return this.createTransaction({
      idempotencyKey: key,
      debitUserId: "SYSTEM",
      creditUserId: userId,
      amount: 3,
      reason: "signup_grant"
    });
  }

  // Listings
  async createListing(ownerUserId: string, input: {
    projectId: string; scriptId: string; title: string; description: string;
    genre: string; format: string; pageCount: number;
  }): Promise<FeedbackListing> {
    const listing: FeedbackListing = {
      id: this.id("listing"),
      ownerUserId,
      projectId: input.projectId,
      scriptId: input.scriptId,
      title: input.title,
      description: input.description,
      genre: input.genre,
      format: input.format,
      pageCount: input.pageCount,
      status: "open",
      claimedByUserId: null,
      reviewDeadline: null,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  async getListing(listingId: string): Promise<FeedbackListing | null> {
    return this.listings.get(listingId) ?? null;
  }

  async listListings(filters: FeedbackListingFilters): Promise<FeedbackListing[]> {
    let results = Array.from(this.listings.values());
    if (filters.status) results = results.filter((l) => l.status === filters.status);
    if (filters.genre) results = results.filter((l) => l.genre === filters.genre);
    if (filters.format) results = results.filter((l) => l.format === filters.format);
    if (filters.ownerUserId) results = results.filter((l) => l.ownerUserId === filters.ownerUserId);
    return results;
  }

  async claimListing(listingId: string, claimerUserId: string): Promise<{ listing: FeedbackListing; review: FeedbackReview } | null> {
    const listing = this.listings.get(listingId);
    if (!listing || listing.status !== "open") return null;
    listing.status = "claimed";
    listing.claimedByUserId = claimerUserId;
    listing.reviewDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
    listing.updatedAt = new Date().toISOString();

    const review: FeedbackReview = {
      id: this.id("review"),
      listingId,
      reviewerUserId: claimerUserId,
      scoreStoryStructure: null,
      commentStoryStructure: null,
      scoreCharacters: null,
      commentCharacters: null,
      scoreDialogue: null,
      commentDialogue: null,
      scoreCraftVoice: null,
      commentCraftVoice: null,
      overallComment: null,
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.reviews.set(review.id, review);
    return { listing, review };
  }

  async cancelListing(listingId: string, ownerUserId: string): Promise<FeedbackListing | null> {
    const listing = this.listings.get(listingId);
    if (!listing || listing.ownerUserId !== ownerUserId || listing.status !== "open") return null;
    listing.status = "cancelled";
    listing.updatedAt = new Date().toISOString();
    return listing;
  }

  async expireStaleListings(): Promise<number> {
    let count = 0;
    for (const listing of this.listings.values()) {
      if (listing.status === "open" && new Date(listing.expiresAt) < new Date()) {
        listing.status = "expired";
        count++;
      }
    }
    return count;
  }

  async expireOverdueReviews(): Promise<number> {
    let count = 0;
    for (const listing of this.listings.values()) {
      if (listing.status === "claimed" && listing.reviewDeadline && new Date(listing.reviewDeadline) < new Date()) {
        listing.status = "open";
        listing.claimedByUserId = null;
        listing.reviewDeadline = null;
        count++;
      }
    }
    return count;
  }

  // Reviews
  async getReview(reviewId: string): Promise<FeedbackReview | null> {
    return this.reviews.get(reviewId) ?? null;
  }

  async getReviewByListing(listingId: string): Promise<FeedbackReview | null> {
    for (const review of this.reviews.values()) {
      if (review.listingId === listingId) return review;
    }
    return null;
  }

  async listReviewsByReviewer(reviewerUserId: string): Promise<FeedbackReview[]> {
    return Array.from(this.reviews.values()).filter((r) => r.reviewerUserId === reviewerUserId);
  }

  async submitReview(reviewId: string, input: FeedbackReviewSubmitRequest): Promise<FeedbackReview | null> {
    const review = this.reviews.get(reviewId);
    if (!review || review.status !== "in_progress") return null;
    review.scoreStoryStructure = input.rubric.storyStructure.score;
    review.commentStoryStructure = input.rubric.storyStructure.comment;
    review.scoreCharacters = input.rubric.characters.score;
    review.commentCharacters = input.rubric.characters.comment;
    review.scoreDialogue = input.rubric.dialogue.score;
    review.commentDialogue = input.rubric.dialogue.comment;
    review.scoreCraftVoice = input.rubric.craftVoice.score;
    review.commentCraftVoice = input.rubric.craftVoice.comment;
    review.overallComment = input.overallComment;
    review.status = "submitted";
    review.updatedAt = new Date().toISOString();

    // Mark listing as completed
    const listing = this.listings.get(review.listingId);
    if (listing) {
      listing.status = "completed";
      listing.updatedAt = new Date().toISOString();
    }

    return review;
  }

  // Ratings
  async createRating(reviewId: string, raterUserId: string, score: number, comment: string): Promise<ReviewerRating | null> {
    if (this.ratings.has(reviewId)) return null;
    const rating: ReviewerRating = {
      id: this.id("rating"),
      reviewId,
      raterUserId,
      score,
      comment,
      createdAt: new Date().toISOString()
    };
    this.ratings.set(reviewId, rating);
    return rating;
  }

  async getRatingByReview(reviewId: string): Promise<ReviewerRating | null> {
    return this.ratings.get(reviewId) ?? null;
  }

  // Reputation
  async getReputation(userId: string): Promise<ReviewerReputation> {
    const scores: number[] = [];
    for (const [reviewId, rating] of this.ratings.entries()) {
      const review = this.reviews.get(reviewId);
      if (review?.reviewerUserId === userId) {
        scores.push(rating.score);
      }
    }
    const activeStrikes = await this.getActiveStrikeCount(userId);
    const suspended = await this.isSuspended(userId);
    return {
      userId,
      averageRating: scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null,
      totalReviews: scores.length,
      activeStrikes,
      isSuspended: suspended
    };
  }

  async issueStrike(reviewerUserId: string, reason: string): Promise<void> {
    const existing = this.strikes.get(reviewerUserId) ?? [];
    existing.push({ userId: reviewerUserId, reason, active: true, expiresAt: new Date(Date.now() + 90 * 86400000) });
    this.strikes.set(reviewerUserId, existing);
  }

  async getActiveStrikeCount(reviewerUserId: string): Promise<number> {
    const strikes = this.strikes.get(reviewerUserId) ?? [];
    return strikes.filter((s) => s.active && s.expiresAt > new Date()).length;
  }

  async isSuspended(reviewerUserId: string): Promise<boolean> {
    return this.suspensions.has(reviewerUserId);
  }

  async suspendReviewer(reviewerUserId: string): Promise<void> {
    this.suspensions.add(reviewerUserId);
  }

  async decayExpiredStrikes(): Promise<number> {
    let count = 0;
    for (const strikes of this.strikes.values()) {
      for (const strike of strikes) {
        if (strike.active && strike.expiresAt <= new Date()) {
          strike.active = false;
          count++;
        }
      }
    }
    return count;
  }

  // Disputes
  async createDispute(reviewId: string, filedByUserId: string, reason: string): Promise<FeedbackDispute | null> {
    for (const dispute of this.disputes.values()) {
      if (dispute.reviewId === reviewId && dispute.filedByUserId === filedByUserId) return null;
    }
    const dispute: FeedbackDispute = {
      id: this.id("dispute"),
      reviewId,
      filedByUserId,
      reason,
      status: "open",
      resolutionNote: null,
      resolvedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  async getDispute(disputeId: string): Promise<FeedbackDispute | null> {
    return this.disputes.get(disputeId) ?? null;
  }

  async listDisputes(status?: FeedbackDisputeStatus): Promise<FeedbackDispute[]> {
    let results = Array.from(this.disputes.values());
    if (status) results = results.filter((d) => d.status === status);
    return results;
  }

  async resolveDispute(disputeId: string, resolvedByUserId: string, status: FeedbackDisputeStatus, resolutionNote: string): Promise<FeedbackDispute | null> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute || (dispute.status !== "open" && dispute.status !== "under_review")) return null;
    dispute.status = status;
    dispute.resolvedByUserId = resolvedByUserId;
    dispute.resolutionNote = resolutionNote;
    dispute.updatedAt = new Date().toISOString();
    return dispute;
  }

  // Abuse
  async hasDuplicateReview(listingId: string, reviewerUserId: string): Promise<boolean> {
    for (const review of this.reviews.values()) {
      if (review.listingId === listingId && review.reviewerUserId === reviewerUserId) return true;
    }
    return false;
  }
}

function createServer() {
  const events: NotificationEventEnvelope[] = [];
  const repo = new MemoryFeedbackExchangeRepository();
  const server = buildServer({
    logger: false,
    repository: repo,
    publisher: async (event) => {
      events.push(event);
    }
  });
  return { server, events, repo };
}

// ── Token tests ──────────────────────────────────────────────────────

test("signup grant is idempotent", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res1 = await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(res1.statusCode, 201);

  const res2 = await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(res2.statusCode, 201);

  const balRes = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_01/balance"
  });
  assert.equal(balRes.json().balance, 3);
});

test("balance is derived from ledger", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Grant signup tokens
  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_01/balance"
  });
  assert.equal(res.json().balance, 3);
});

test("listing creation debits 1 token", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Grant tokens first
  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  const res = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "project_1",
      scriptId: "script_1",
      title: "My Script",
      genre: "drama",
      format: "feature",
      pageCount: 120
    }
  });
  assert.equal(res.statusCode, 201);

  const balRes = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_01/balance"
  });
  assert.equal(balRes.json().balance, 2);
});

test("insufficient balance rejects listing", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "project_1",
      scriptId: "script_1",
      title: "My Script",
      genre: "drama",
      format: "feature"
    }
  });
  assert.equal(res.statusCode, 402);
  assert.equal(res.json().error, "insufficient_tokens");
});

// ── Listing tests ────────────────────────────────────────────────────

test("self-review is blocked", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Test",
      genre: "drama", format: "feature"
    }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(claimRes.statusCode, 400);
  assert.equal(claimRes.json().error, "cannot_review_own_listing");
});

test("suspended user cannot claim", async (t) => {
  const { server, repo } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Test",
      genre: "drama", format: "feature"
    }
  });
  const listingId = listRes.json().listing.id;

  await repo.suspendReviewer("writer_02");

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(claimRes.statusCode, 403);
  assert.equal(claimRes.json().error, "reviewer_suspended");
});

test("cancel refunds token", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Test",
      genre: "drama", format: "feature"
    }
  });
  const listingId = listRes.json().listing.id;

  const cancelRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/cancel`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(cancelRes.statusCode, 200);

  const balRes = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_01/balance"
  });
  assert.equal(balRes.json().balance, 3);
});

test("listing filter by genre", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });

  await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Drama Script",
      genre: "drama", format: "feature"
    }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/listings?genre=comedy"
  });
  assert.equal(res.json().listings.length, 0);
});

// ── Review tests ─────────────────────────────────────────────────────

test("submit review with valid rubric credits 1 token", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Setup: writer_01 creates listing, writer_02 claims
  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });
  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_02" }
  });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Test",
      genre: "drama", format: "feature"
    }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(claimRes.statusCode, 201);
  const reviewId = claimRes.json().review.id;

  const submitRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/submit`,
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: {
      rubric: {
        storyStructure: { score: 4, comment: "Good structure" },
        characters: { score: 3, comment: "Needs work" },
        dialogue: { score: 5, comment: "Excellent" },
        craftVoice: { score: 4, comment: "Strong voice" }
      },
      overallComment: "Promising script"
    }
  });
  assert.equal(submitRes.statusCode, 200);

  const balRes = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_02/balance"
  });
  assert.equal(balRes.json().balance, 4); // 3 signup + 1 review reward
});

test("reject incomplete rubric", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_01" }
  });
  await server.inject({
    method: "POST",
    url: "/internal/tokens/grant-signup",
    headers: { "x-auth-user-id": "writer_02" }
  });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      projectId: "p1", scriptId: "s1", title: "Test",
      genre: "drama", format: "feature"
    }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  const reviewId = claimRes.json().review.id;

  const submitRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/submit`,
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: {
      rubric: {
        storyStructure: { score: 4, comment: "Good" }
        // Missing other categories
      }
    }
  });
  assert.equal(submitRes.statusCode, 400);
});

// ── Rating tests ─────────────────────────────────────────────────────

test("auto-strike on low rating", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Setup complete flow
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_01" } });
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_02" } });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { projectId: "p1", scriptId: "s1", title: "Test", genre: "drama", format: "feature" }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  const reviewId = claimRes.json().review.id;

  await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/submit`,
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: {
      rubric: {
        storyStructure: { score: 4, comment: "Ok" },
        characters: { score: 3, comment: "Ok" },
        dialogue: { score: 5, comment: "Ok" },
        craftVoice: { score: 4, comment: "Ok" }
      },
      overallComment: "Fine"
    }
  });

  const rateRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/rate`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { score: 1, comment: "Terrible review" }
  });
  assert.equal(rateRes.statusCode, 201);

  // Check reputation for strike
  const repRes = await server.inject({
    method: "GET",
    url: "/internal/reputation/writer_02"
  });
  const reputation = repRes.json().reputation;
  assert.equal(reputation.activeStrikes, 1);
});

// ── Dispute tests ────────────────────────────────────────────────────

test("dispute creation and no duplicates", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Setup complete flow
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_01" } });
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_02" } });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { projectId: "p1", scriptId: "s1", title: "Test", genre: "drama", format: "feature" }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  const reviewId = claimRes.json().review.id;

  await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/submit`,
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: {
      rubric: {
        storyStructure: { score: 4, comment: "Ok" },
        characters: { score: 3, comment: "Ok" },
        dialogue: { score: 5, comment: "Ok" },
        craftVoice: { score: 4, comment: "Ok" }
      },
      overallComment: "Fine"
    }
  });

  // File dispute
  const disputeRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { reason: "The review was unhelpful" }
  });
  assert.equal(disputeRes.statusCode, 201);

  // Duplicate should fail
  const dupRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { reason: "The review was unhelpful" }
  });
  assert.equal(dupRes.statusCode, 409);
});

test("resolve dispute for filer strikes reviewer and refunds", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Setup complete flow
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_01" } });
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_02" } });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { projectId: "p1", scriptId: "s1", title: "Test", genre: "drama", format: "feature" }
  });
  const listingId = listRes.json().listing.id;

  const claimRes = await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  const reviewId = claimRes.json().review.id;

  await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/submit`,
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: {
      rubric: {
        storyStructure: { score: 1, comment: "Bad" },
        characters: { score: 1, comment: "Bad" },
        dialogue: { score: 1, comment: "Bad" },
        craftVoice: { score: 1, comment: "Bad" }
      },
      overallComment: "Spam"
    }
  });

  const disputeRes = await server.inject({
    method: "POST",
    url: `/internal/reviews/${reviewId}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { reason: "Spam review" }
  });
  const disputeId = disputeRes.json().dispute.id;

  const resolveRes = await server.inject({
    method: "POST",
    url: `/internal/disputes/${disputeId}/resolve`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: { status: "resolved_for_filer", resolutionNote: "Reviewer submitted spam" }
  });
  assert.equal(resolveRes.statusCode, 200);
  assert.equal(resolveRes.json().dispute.status, "resolved_for_filer");

  // Check writer_02 got a strike
  const repRes = await server.inject({
    method: "GET",
    url: "/internal/reputation/writer_02"
  });
  assert.ok(repRes.json().reputation.activeStrikes >= 1);

  // Check writer_01 got refunded (original 3 - 1 listing + 1 refund = 3)
  const balRes = await server.inject({
    method: "GET",
    url: "/internal/tokens/writer_01/balance"
  });
  assert.equal(balRes.json().balance, 3);
});

// ── Reviews list ──────────────────────────────────────────────────────

test("list reviews by reviewer", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Setup: writer_01 creates listing, writer_02 claims it
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_01" } });
  await server.inject({ method: "POST", url: "/internal/tokens/grant-signup", headers: { "x-auth-user-id": "writer_02" } });

  const listRes = await server.inject({
    method: "POST",
    url: "/internal/listings",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { projectId: "p1", scriptId: "s1", title: "Test", genre: "drama", format: "feature" }
  });
  const listingId = listRes.json().listing.id;

  await server.inject({
    method: "POST",
    url: `/internal/listings/${listingId}/claim`,
    headers: { "x-auth-user-id": "writer_02" }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/reviews?reviewerUserId=writer_02",
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().reviews.length, 1);
  assert.equal(res.json().reviews[0].reviewerUserId, "writer_02");
});

test("list reviews requires matching auth", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "GET",
    url: "/internal/reviews?reviewerUserId=writer_02",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(res.statusCode, 403);
});

// ── Health ────────────────────────────────────────────────────────────

test("health endpoint returns ok", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});
