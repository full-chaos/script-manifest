import { randomUUID } from "node:crypto";
import {
  ensureFeedbackExchangeTables,
  getPool
} from "@script-manifest/db";
import type {
  FeedbackDispute,
  FeedbackDisputeStatus,
  FeedbackListing,
  FeedbackListingFilters,
  FeedbackReview,
  FeedbackReviewSubmitRequest,
  ReviewerRating,
  ReviewerReputation,
  TokenTransaction,
  TokenTransactionReason
} from "@script-manifest/contracts";

const SYSTEM_USER_ID = "SYSTEM";

export interface FeedbackExchangeRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  // Tokens
  getBalance(userId: string): Promise<number>;
  createTransaction(params: {
    idempotencyKey: string;
    debitUserId: string;
    creditUserId: string;
    amount: number;
    reason: TokenTransactionReason;
    referenceType?: string;
    referenceId?: string;
  }): Promise<TokenTransaction>;
  getTransactionByIdempotencyKey(key: string): Promise<TokenTransaction | null>;
  listTransactions(userId: string): Promise<TokenTransaction[]>;
  ensureSignupGrant(userId: string): Promise<TokenTransaction>;

  // Listings
  createListing(ownerUserId: string, input: {
    projectId: string;
    scriptId: string;
    title: string;
    description: string;
    genre: string;
    format: string;
    pageCount: number;
  }): Promise<FeedbackListing>;
  getListing(listingId: string): Promise<FeedbackListing | null>;
  listListings(filters: FeedbackListingFilters): Promise<FeedbackListing[]>;
  claimListing(listingId: string, claimerUserId: string): Promise<{ listing: FeedbackListing; review: FeedbackReview } | null>;
  cancelListing(listingId: string, ownerUserId: string): Promise<FeedbackListing | null>;
  expireStaleListings(): Promise<number>;
  expireOverdueReviews(): Promise<number>;

  // Reviews
  getReview(reviewId: string): Promise<FeedbackReview | null>;
  getReviewByListing(listingId: string): Promise<FeedbackReview | null>;
  submitReview(reviewId: string, input: FeedbackReviewSubmitRequest): Promise<FeedbackReview | null>;

  // Ratings
  createRating(reviewId: string, raterUserId: string, score: number, comment: string): Promise<ReviewerRating | null>;
  getRatingByReview(reviewId: string): Promise<ReviewerRating | null>;

  // Reputation
  getReputation(userId: string): Promise<ReviewerReputation>;
  issueStrike(reviewerUserId: string, reason: string): Promise<void>;
  getActiveStrikeCount(reviewerUserId: string): Promise<number>;
  isSuspended(reviewerUserId: string): Promise<boolean>;
  suspendReviewer(reviewerUserId: string): Promise<void>;
  decayExpiredStrikes(): Promise<number>;

  // Disputes
  createDispute(reviewId: string, filedByUserId: string, reason: string): Promise<FeedbackDispute | null>;
  getDispute(disputeId: string): Promise<FeedbackDispute | null>;
  listDisputes(status?: FeedbackDisputeStatus): Promise<FeedbackDispute[]>;
  resolveDispute(disputeId: string, resolvedByUserId: string, status: FeedbackDisputeStatus, resolutionNote: string): Promise<FeedbackDispute | null>;

  // Abuse
  hasDuplicateReview(listingId: string, reviewerUserId: string): Promise<boolean>;
}

export class PgFeedbackExchangeRepository implements FeedbackExchangeRepository {
  async init(): Promise<void> {
    await ensureFeedbackExchangeTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  // ── Tokens ───────────────────────────────────────────────────────────

  async getBalance(userId: string): Promise<number> {
    const db = getPool();
    const result = await db.query<{ balance: string }>(
      `SELECT COALESCE(
        (SELECT SUM(amount) FROM token_ledger WHERE credit_user_id = $1), 0
      ) - COALESCE(
        (SELECT SUM(amount) FROM token_ledger WHERE debit_user_id = $1), 0
      ) AS balance`,
      [userId]
    );
    return Number(result.rows[0]?.balance ?? 0);
  }

  async createTransaction(params: {
    idempotencyKey: string;
    debitUserId: string;
    creditUserId: string;
    amount: number;
    reason: TokenTransactionReason;
    referenceType?: string;
    referenceId?: string;
  }): Promise<TokenTransaction> {
    const db = getPool();
    const id = `txn_${randomUUID()}`;
    const result = await db.query<{
      id: string;
      idempotency_key: string;
      debit_user_id: string;
      credit_user_id: string;
      amount: number;
      reason: string;
      reference_type: string;
      reference_id: string;
      created_at: string;
    }>(
      `INSERT INTO token_ledger (id, idempotency_key, debit_user_id, credit_user_id, amount, reason, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, params.idempotencyKey, params.debitUserId, params.creditUserId, params.amount, params.reason, params.referenceType ?? "", params.referenceId ?? ""]
    );
    return mapTransaction(result.rows[0]!);
  }

  async getTransactionByIdempotencyKey(key: string): Promise<TokenTransaction | null> {
    const db = getPool();
    const result = await db.query<{
      id: string; idempotency_key: string; debit_user_id: string; credit_user_id: string;
      amount: number; reason: string; reference_type: string; reference_id: string; created_at: string;
    }>(
      `SELECT * FROM token_ledger WHERE idempotency_key = $1`,
      [key]
    );
    return result.rows[0] ? mapTransaction(result.rows[0]) : null;
  }

  async listTransactions(userId: string): Promise<TokenTransaction[]> {
    const db = getPool();
    const result = await db.query<{
      id: string; idempotency_key: string; debit_user_id: string; credit_user_id: string;
      amount: number; reason: string; reference_type: string; reference_id: string; created_at: string;
    }>(
      `SELECT * FROM token_ledger WHERE debit_user_id = $1 OR credit_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(mapTransaction);
  }

  async ensureSignupGrant(userId: string): Promise<TokenTransaction> {
    const key = `signup_grant_${userId}`;
    const existing = await this.getTransactionByIdempotencyKey(key);
    if (existing) return existing;
    return this.createTransaction({
      idempotencyKey: key,
      debitUserId: SYSTEM_USER_ID,
      creditUserId: userId,
      amount: 3,
      reason: "signup_grant"
    });
  }

  // ── Listings ─────────────────────────────────────────────────────────

  async createListing(ownerUserId: string, input: {
    projectId: string; scriptId: string; title: string; description: string;
    genre: string; format: string; pageCount: number;
  }): Promise<FeedbackListing> {
    const db = getPool();
    const id = `listing_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.query<ListingRow>(
      `INSERT INTO feedback_listings (id, owner_user_id, project_id, script_id, title, description, genre, format, page_count, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
       RETURNING *`,
      [id, ownerUserId, input.projectId, input.scriptId, input.title, input.description, input.genre, input.format, input.pageCount, expiresAt]
    );
    return mapListing(result.rows[0]!);
  }

  async getListing(listingId: string): Promise<FeedbackListing | null> {
    const db = getPool();
    const result = await db.query<ListingRow>(
      `SELECT * FROM feedback_listings WHERE id = $1`,
      [listingId]
    );
    return result.rows[0] ? mapListing(result.rows[0]) : null;
  }

  async listListings(filters: FeedbackListingFilters): Promise<FeedbackListing[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.genre) {
      values.push(filters.genre);
      conditions.push(`genre = $${values.length}`);
    }
    if (filters.format) {
      values.push(filters.format);
      conditions.push(`format = $${values.length}`);
    }
    if (filters.ownerUserId) {
      values.push(filters.ownerUserId);
      conditions.push(`owner_user_id = $${values.length}`);
    }

    let query = `SELECT * FROM feedback_listings`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += ` ORDER BY created_at DESC`;

    const limit = filters.limit ?? 30;
    const offset = filters.offset ?? 0;
    values.push(limit);
    query += ` LIMIT $${values.length}`;
    values.push(offset);
    query += ` OFFSET $${values.length}`;

    const result = await db.query<ListingRow>(query, values);
    return result.rows.map(mapListing);
  }

  async claimListing(listingId: string, claimerUserId: string): Promise<{ listing: FeedbackListing; review: FeedbackReview } | null> {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const listingResult = await client.query<ListingRow>(
        `UPDATE feedback_listings SET status = 'claimed', claimed_by_user_id = $2,
         review_deadline = NOW() + INTERVAL '7 days', updated_at = NOW()
         WHERE id = $1 AND status = 'open'
         RETURNING *`,
        [listingId, claimerUserId]
      );
      const listingRow = listingResult.rows[0];
      if (!listingRow) {
        await client.query("ROLLBACK");
        return null;
      }

      const reviewId = `review_${randomUUID()}`;
      const reviewResult = await client.query<ReviewRow>(
        `INSERT INTO feedback_reviews (id, listing_id, reviewer_user_id, status)
         VALUES ($1, $2, $3, 'in_progress')
         RETURNING *`,
        [reviewId, listingId, claimerUserId]
      );

      await client.query("COMMIT");
      return {
        listing: mapListing(listingRow),
        review: mapReview(reviewResult.rows[0]!)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelListing(listingId: string, ownerUserId: string): Promise<FeedbackListing | null> {
    const db = getPool();
    const result = await db.query<ListingRow>(
      `UPDATE feedback_listings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND owner_user_id = $2 AND status = 'open'
       RETURNING *`,
      [listingId, ownerUserId]
    );
    return result.rows[0] ? mapListing(result.rows[0]) : null;
  }

  async expireStaleListings(): Promise<number> {
    const db = getPool();
    const result = await db.query(
      `UPDATE feedback_listings SET status = 'expired', updated_at = NOW()
       WHERE status = 'open' AND expires_at < NOW()`
    );
    return result.rowCount ?? 0;
  }

  async expireOverdueReviews(): Promise<number> {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const overdueListings = await client.query<{ id: string }>(
        `SELECT id FROM feedback_listings
         WHERE status = 'claimed' AND review_deadline < NOW()`
      );
      for (const row of overdueListings.rows) {
        await client.query(
          `UPDATE feedback_listings SET status = 'open', claimed_by_user_id = NULL,
           review_deadline = NULL, updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await client.query(
          `DELETE FROM feedback_reviews WHERE listing_id = $1 AND status = 'in_progress'`,
          [row.id]
        );
      }
      await client.query("COMMIT");
      return overdueListings.rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Reviews ──────────────────────────────────────────────────────────

  async getReview(reviewId: string): Promise<FeedbackReview | null> {
    const db = getPool();
    const result = await db.query<ReviewRow>(
      `SELECT * FROM feedback_reviews WHERE id = $1`,
      [reviewId]
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  }

  async getReviewByListing(listingId: string): Promise<FeedbackReview | null> {
    const db = getPool();
    const result = await db.query<ReviewRow>(
      `SELECT * FROM feedback_reviews WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [listingId]
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  }

  async submitReview(reviewId: string, input: FeedbackReviewSubmitRequest): Promise<FeedbackReview | null> {
    const db = getPool();
    const result = await db.query<ReviewRow>(
      `UPDATE feedback_reviews SET
        score_story_structure = $2, comment_story_structure = $3,
        score_characters = $4, comment_characters = $5,
        score_dialogue = $6, comment_dialogue = $7,
        score_craft_voice = $8, comment_craft_voice = $9,
        overall_comment = $10, status = 'submitted', updated_at = NOW()
       WHERE id = $1 AND status = 'in_progress'
       RETURNING *`,
      [
        reviewId,
        input.rubric.storyStructure.score, input.rubric.storyStructure.comment,
        input.rubric.characters.score, input.rubric.characters.comment,
        input.rubric.dialogue.score, input.rubric.dialogue.comment,
        input.rubric.craftVoice.score, input.rubric.craftVoice.comment,
        input.overallComment
      ]
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  }

  // ── Ratings ──────────────────────────────────────────────────────────

  async createRating(reviewId: string, raterUserId: string, score: number, comment: string): Promise<ReviewerRating | null> {
    const db = getPool();
    const id = `rating_${randomUUID()}`;
    try {
      const result = await db.query<{
        id: string; review_id: string; rater_user_id: string;
        score: number; comment: string; created_at: string;
      }>(
        `INSERT INTO reviewer_ratings (id, review_id, rater_user_id, score, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, reviewId, raterUserId, score, comment]
      );
      return result.rows[0] ? mapRating(result.rows[0]) : null;
    } catch {
      return null; // Unique constraint on review_id — already rated
    }
  }

  async getRatingByReview(reviewId: string): Promise<ReviewerRating | null> {
    const db = getPool();
    const result = await db.query<{
      id: string; review_id: string; rater_user_id: string;
      score: number; comment: string; created_at: string;
    }>(
      `SELECT * FROM reviewer_ratings WHERE review_id = $1`,
      [reviewId]
    );
    return result.rows[0] ? mapRating(result.rows[0]) : null;
  }

  // ── Reputation ───────────────────────────────────────────────────────

  async getReputation(userId: string): Promise<ReviewerReputation> {
    const db = getPool();
    const avgResult = await db.query<{ avg_score: string | null; total: string }>(
      `SELECT AVG(rr.score)::text AS avg_score, COUNT(*)::text AS total
       FROM reviewer_ratings rr
       JOIN feedback_reviews fr ON fr.id = rr.review_id
       WHERE fr.reviewer_user_id = $1`,
      [userId]
    );
    const row = avgResult.rows[0];
    const averageRating = row?.avg_score ? Number(Number(row.avg_score).toFixed(2)) : null;
    const totalReviews = Number(row?.total ?? 0);
    const activeStrikes = await this.getActiveStrikeCount(userId);
    const suspended = await this.isSuspended(userId);
    return { userId, averageRating, totalReviews, activeStrikes, isSuspended: suspended };
  }

  async issueStrike(reviewerUserId: string, reason: string): Promise<void> {
    const db = getPool();
    const id = `strike_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      `INSERT INTO reviewer_strikes (id, reviewer_user_id, reason, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, reviewerUserId, reason, expiresAt]
    );
  }

  async getActiveStrikeCount(reviewerUserId: string): Promise<number> {
    const db = getPool();
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM reviewer_strikes
       WHERE reviewer_user_id = $1 AND is_active = TRUE AND expires_at > NOW()`,
      [reviewerUserId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async isSuspended(reviewerUserId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM reviewer_suspensions
       WHERE reviewer_user_id = $1 AND is_active = TRUE AND lifted_at > NOW()`,
      [reviewerUserId]
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async suspendReviewer(reviewerUserId: string): Promise<void> {
    const db = getPool();
    const id = `suspension_${randomUUID()}`;
    const liftedAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      `INSERT INTO reviewer_suspensions (id, reviewer_user_id, lifted_at)
       VALUES ($1, $2, $3)`,
      [id, reviewerUserId, liftedAt]
    );
  }

  async decayExpiredStrikes(): Promise<number> {
    const db = getPool();
    const result = await db.query(
      `UPDATE reviewer_strikes SET is_active = FALSE
       WHERE is_active = TRUE AND expires_at <= NOW()`
    );
    return result.rowCount ?? 0;
  }

  // ── Disputes ─────────────────────────────────────────────────────────

  async createDispute(reviewId: string, filedByUserId: string, reason: string): Promise<FeedbackDispute | null> {
    const db = getPool();
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM feedback_disputes WHERE review_id = $1 AND filed_by_user_id = $2`,
      [reviewId, filedByUserId]
    );
    if (existing.rows.length > 0) return null;

    const id = `dispute_${randomUUID()}`;
    const result = await db.query<DisputeRow>(
      `INSERT INTO feedback_disputes (id, review_id, filed_by_user_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, reviewId, filedByUserId, reason]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }

  async getDispute(disputeId: string): Promise<FeedbackDispute | null> {
    const db = getPool();
    const result = await db.query<DisputeRow>(
      `SELECT * FROM feedback_disputes WHERE id = $1`,
      [disputeId]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }

  async listDisputes(status?: FeedbackDisputeStatus): Promise<FeedbackDispute[]> {
    const db = getPool();
    let query = `SELECT * FROM feedback_disputes`;
    const values: unknown[] = [];
    if (status) {
      values.push(status);
      query += ` WHERE status = $1`;
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<DisputeRow>(query, values);
    return result.rows.map(mapDispute);
  }

  async resolveDispute(disputeId: string, resolvedByUserId: string, status: FeedbackDisputeStatus, resolutionNote: string): Promise<FeedbackDispute | null> {
    const db = getPool();
    const result = await db.query<DisputeRow>(
      `UPDATE feedback_disputes SET status = $2, resolved_by_user_id = $3,
       resolution_note = $4, updated_at = NOW()
       WHERE id = $1 AND status IN ('open', 'under_review')
       RETURNING *`,
      [disputeId, status, resolvedByUserId, resolutionNote]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }

  // ── Abuse ────────────────────────────────────────────────────────────

  async hasDuplicateReview(listingId: string, reviewerUserId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM feedback_reviews
       WHERE listing_id = $1 AND reviewer_user_id = $2`,
      [listingId, reviewerUserId]
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }
}

// ── Row types & mappers ────────────────────────────────────────────────

type ListingRow = {
  id: string; owner_user_id: string; project_id: string; script_id: string;
  title: string; description: string; genre: string; format: string;
  page_count: number; status: string; claimed_by_user_id: string | null;
  review_deadline: string | null; expires_at: string;
  created_at: string; updated_at: string;
};

function mapListing(row: ListingRow): FeedbackListing {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    projectId: row.project_id,
    scriptId: row.script_id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    format: row.format,
    pageCount: row.page_count,
    status: row.status as FeedbackListing["status"],
    claimedByUserId: row.claimed_by_user_id,
    reviewDeadline: row.review_deadline,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

type ReviewRow = {
  id: string; listing_id: string; reviewer_user_id: string;
  score_story_structure: number | null; comment_story_structure: string | null;
  score_characters: number | null; comment_characters: string | null;
  score_dialogue: number | null; comment_dialogue: string | null;
  score_craft_voice: number | null; comment_craft_voice: string | null;
  overall_comment: string | null; status: string;
  created_at: string; updated_at: string;
};

function mapReview(row: ReviewRow): FeedbackReview {
  return {
    id: row.id,
    listingId: row.listing_id,
    reviewerUserId: row.reviewer_user_id,
    scoreStoryStructure: row.score_story_structure,
    commentStoryStructure: row.comment_story_structure,
    scoreCharacters: row.score_characters,
    commentCharacters: row.comment_characters,
    scoreDialogue: row.score_dialogue,
    commentDialogue: row.comment_dialogue,
    scoreCraftVoice: row.score_craft_voice,
    commentCraftVoice: row.comment_craft_voice,
    overallComment: row.overall_comment,
    status: row.status as FeedbackReview["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTransaction(row: {
  id: string; idempotency_key: string; debit_user_id: string; credit_user_id: string;
  amount: number; reason: string; reference_type: string; reference_id: string; created_at: string;
}): TokenTransaction {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    debitUserId: row.debit_user_id,
    creditUserId: row.credit_user_id,
    amount: row.amount,
    reason: row.reason as TokenTransaction["reason"],
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at
  };
}

function mapRating(row: {
  id: string; review_id: string; rater_user_id: string;
  score: number; comment: string; created_at: string;
}): ReviewerRating {
  return {
    id: row.id,
    reviewId: row.review_id,
    raterUserId: row.rater_user_id,
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at
  };
}

type DisputeRow = {
  id: string; review_id: string; filed_by_user_id: string;
  reason: string; status: string; resolution_note: string | null;
  resolved_by_user_id: string | null; created_at: string; updated_at: string;
};

function mapDispute(row: DisputeRow): FeedbackDispute {
  return {
    id: row.id,
    reviewId: row.review_id,
    filedByUserId: row.filed_by_user_id,
    reason: row.reason,
    status: row.status as FeedbackDispute["status"],
    resolutionNote: row.resolution_note,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
