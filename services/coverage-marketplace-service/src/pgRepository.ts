import { randomUUID } from "node:crypto";
import {
  ensureCoverageMarketplaceTables,
  getPool
} from "@script-manifest/db";
import type {
  CoverageProvider,
  CoverageProviderCreateRequest,
  CoverageProviderUpdateRequest,
  CoverageProviderFilters,
  CoverageService,
  CoverageServiceCreateRequest,
  CoverageServiceUpdateRequest,
  CoverageServiceFilters,
  CoverageOrder,
  CoverageOrderFilters,
  CoverageDelivery,
  CoverageDeliveryCreateRequest,
  CoverageReview,
  CoverageReviewCreateRequest,
  CoverageDispute,
  CoverageDisputeCreateRequest,
  CoverageDisputeResolveRequest,
  CoverageDisputeStatus
} from "@script-manifest/contracts";
import type { CoverageMarketplaceRepository } from "./repository.js";

export class PgCoverageMarketplaceRepository implements CoverageMarketplaceRepository {
  async init(): Promise<void> {
    await ensureCoverageMarketplaceTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  // ── Providers ────────────────────────────────────────────────────────

  async createProvider(userId: string, input: CoverageProviderCreateRequest): Promise<CoverageProvider> {
    const db = getPool();
    const id = `cprov_${randomUUID()}`;
    const result = await db.query<ProviderRow>(
      `INSERT INTO coverage_providers (id, user_id, display_name, bio, specialties, status)
       VALUES ($1, $2, $3, $4, $5, 'pending_verification')
       RETURNING *`,
      [id, userId, input.displayName, input.bio, input.specialties]
    );
    return mapProvider(result.rows[0]!);
  }

  async getProvider(providerId: string): Promise<CoverageProvider | null> {
    const db = getPool();
    const result = await db.query<ProviderRow>(
      `SELECT * FROM coverage_providers WHERE id = $1`,
      [providerId]
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : null;
  }

  async getProviderByUserId(userId: string): Promise<CoverageProvider | null> {
    const db = getPool();
    const result = await db.query<ProviderRow>(
      `SELECT * FROM coverage_providers WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : null;
  }

  async updateProvider(providerId: string, input: CoverageProviderUpdateRequest): Promise<CoverageProvider | null> {
    const db = getPool();
    const updates: string[] = [];
    const values: unknown[] = [providerId];

    if (input.displayName !== undefined) {
      values.push(input.displayName);
      updates.push(`display_name = $${values.length}`);
    }
    if (input.bio !== undefined) {
      values.push(input.bio);
      updates.push(`bio = $${values.length}`);
    }
    if (input.specialties !== undefined) {
      values.push(input.specialties);
      updates.push(`specialties = $${values.length}`);
    }

    if (updates.length === 0) {
      return this.getProvider(providerId);
    }

    updates.push("updated_at = NOW()");
    const result = await db.query<ProviderRow>(
      `UPDATE coverage_providers SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING *`,
      values
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : null;
  }

  async updateProviderStripe(providerId: string, stripeAccountId: string, onboardingComplete: boolean): Promise<CoverageProvider | null> {
    const db = getPool();
    const statusUpdate = onboardingComplete ? ", status = 'active'" : "";
    const result = await db.query<ProviderRow>(
      `UPDATE coverage_providers
       SET stripe_account_id = $2, stripe_onboarding_complete = $3${statusUpdate}, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [providerId, stripeAccountId, onboardingComplete]
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : null;
  }

  async updateProviderStatus(providerId: string, status: string): Promise<CoverageProvider | null> {
    const db = getPool();
    const result = await db.query<ProviderRow>(
      `UPDATE coverage_providers SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [providerId, status]
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : null;
  }

  async listProviders(filters: CoverageProviderFilters): Promise<CoverageProvider[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.specialty) {
      values.push(filters.specialty);
      conditions.push(`$${values.length} = ANY(specialties)`);
    }

    let query = `SELECT * FROM coverage_providers`;
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

    const result = await db.query<ProviderRow>(query, values);
    return result.rows.map(mapProvider);
  }

  // ── Services ─────────────────────────────────────────────────────────

  async createService(providerId: string, input: CoverageServiceCreateRequest): Promise<CoverageService> {
    const db = getPool();
    const id = `csvc_${randomUUID()}`;
    const result = await db.query<ServiceRow>(
      `INSERT INTO coverage_services (id, provider_id, title, description, tier, price_cents, currency, turnaround_days, max_pages, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       RETURNING *`,
      [id, providerId, input.title, input.description, input.tier, input.priceCents, input.currency, input.turnaroundDays, input.maxPages]
    );
    return mapService(result.rows[0]!);
  }

  async getService(serviceId: string): Promise<CoverageService | null> {
    const db = getPool();
    const result = await db.query<ServiceRow>(
      `SELECT * FROM coverage_services WHERE id = $1`,
      [serviceId]
    );
    return result.rows[0] ? mapService(result.rows[0]) : null;
  }

  async updateService(serviceId: string, input: CoverageServiceUpdateRequest): Promise<CoverageService | null> {
    const db = getPool();
    const updates: string[] = [];
    const values: unknown[] = [serviceId];

    if (input.title !== undefined) {
      values.push(input.title);
      updates.push(`title = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description);
      updates.push(`description = $${values.length}`);
    }
    if (input.priceCents !== undefined) {
      values.push(input.priceCents);
      updates.push(`price_cents = $${values.length}`);
    }
    if (input.turnaroundDays !== undefined) {
      values.push(input.turnaroundDays);
      updates.push(`turnaround_days = $${values.length}`);
    }
    if (input.maxPages !== undefined) {
      values.push(input.maxPages);
      updates.push(`max_pages = $${values.length}`);
    }
    if (input.active !== undefined) {
      values.push(input.active);
      updates.push(`active = $${values.length}`);
    }

    if (updates.length === 0) {
      return this.getService(serviceId);
    }

    updates.push("updated_at = NOW()");
    const result = await db.query<ServiceRow>(
      `UPDATE coverage_services SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING *`,
      values
    );
    return result.rows[0] ? mapService(result.rows[0]) : null;
  }

  async listServicesByProvider(providerId: string): Promise<CoverageService[]> {
    const db = getPool();
    const result = await db.query<ServiceRow>(
      `SELECT * FROM coverage_services WHERE provider_id = $1 ORDER BY created_at DESC`,
      [providerId]
    );
    return result.rows.map(mapService);
  }

  async listServices(filters: CoverageServiceFilters): Promise<CoverageService[]> {
    const db = getPool();
    const conditions: string[] = ["active = TRUE"];
    const values: unknown[] = [];

    if (filters.tier) {
      values.push(filters.tier);
      conditions.push(`tier = $${values.length}`);
    }
    if (filters.minPrice !== undefined) {
      values.push(filters.minPrice);
      conditions.push(`price_cents >= $${values.length}`);
    }
    if (filters.maxPrice !== undefined) {
      values.push(filters.maxPrice);
      conditions.push(`price_cents <= $${values.length}`);
    }
    if (filters.maxTurnaround !== undefined) {
      values.push(filters.maxTurnaround);
      conditions.push(`turnaround_days <= $${values.length}`);
    }
    if (filters.providerId) {
      values.push(filters.providerId);
      conditions.push(`provider_id = $${values.length}`);
    }

    let query = `SELECT * FROM coverage_services WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`;

    const limit = filters.limit ?? 30;
    const offset = filters.offset ?? 0;
    values.push(limit);
    query += ` LIMIT $${values.length}`;
    values.push(offset);
    query += ` OFFSET $${values.length}`;

    const result = await db.query<ServiceRow>(query, values);
    return result.rows.map(mapService);
  }

  // ── Orders ───────────────────────────────────────────────────────────

  async createOrder(params: {
    writerUserId: string;
    providerId: string;
    serviceId: string;
    scriptId: string;
    projectId: string;
    priceCents: number;
    platformFeeCents: number;
    providerPayoutCents: number;
    stripePaymentIntentId: string;
  }): Promise<CoverageOrder> {
    const db = getPool();
    const id = `cord_${randomUUID()}`;
    const result = await db.query<OrderRow>(
      `INSERT INTO coverage_orders (id, writer_user_id, provider_id, service_id, script_id, project_id,
       status, price_cents, platform_fee_cents, provider_payout_cents, stripe_payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'placed', $7, $8, $9, $10)
       RETURNING *`,
      [id, params.writerUserId, params.providerId, params.serviceId, params.scriptId, params.projectId,
       params.priceCents, params.platformFeeCents, params.providerPayoutCents, params.stripePaymentIntentId]
    );
    return mapOrder(result.rows[0]!);
  }

  async getOrder(orderId: string): Promise<CoverageOrder | null> {
    const db = getPool();
    const result = await db.query<OrderRow>(
      `SELECT * FROM coverage_orders WHERE id = $1`,
      [orderId]
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  }

  async listOrders(filters: CoverageOrderFilters): Promise<CoverageOrder[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.providerId) {
      values.push(filters.providerId);
      conditions.push(`provider_id = $${values.length}`);
    }
    if (filters.writerUserId) {
      values.push(filters.writerUserId);
      conditions.push(`writer_user_id = $${values.length}`);
    }

    let query = `SELECT * FROM coverage_orders`;
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

    const result = await db.query<OrderRow>(query, values);
    return result.rows.map(mapOrder);
  }

  async updateOrderStatus(orderId: string, status: string, extra?: Partial<{
    stripePaymentIntentId: string;
    stripeTransferId: string;
    slaDeadline: string;
    deliveredAt: string;
  }>): Promise<CoverageOrder | null> {
    const db = getPool();
    const updates: string[] = [`status = $2`];
    const values: unknown[] = [orderId, status];

    if (extra?.stripePaymentIntentId !== undefined) {
      values.push(extra.stripePaymentIntentId);
      updates.push(`stripe_payment_intent_id = $${values.length}`);
    }
    if (extra?.stripeTransferId !== undefined) {
      values.push(extra.stripeTransferId);
      updates.push(`stripe_transfer_id = $${values.length}`);
    }
    if (extra?.slaDeadline !== undefined) {
      values.push(extra.slaDeadline);
      updates.push(`sla_deadline = $${values.length}`);
    }
    if (extra?.deliveredAt !== undefined) {
      values.push(extra.deliveredAt);
      updates.push(`delivered_at = $${values.length}`);
    }

    updates.push("updated_at = NOW()");
    const result = await db.query<OrderRow>(
      `UPDATE coverage_orders SET ${updates.join(", ")}
       WHERE id = $1
       RETURNING *`,
      values
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  }

  // ── Deliveries ───────────────────────────────────────────────────────

  async createDelivery(orderId: string, input: CoverageDeliveryCreateRequest): Promise<CoverageDelivery> {
    const db = getPool();
    const id = `cdel_${randomUUID()}`;
    const result = await db.query<DeliveryRow>(
      `INSERT INTO coverage_deliveries (id, order_id, summary, strengths, weaknesses, recommendations, score, file_key, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, orderId, input.summary, input.strengths ?? "", input.weaknesses ?? "", input.recommendations ?? "",
       input.score ?? null, input.fileKey ?? null, input.fileName ?? null]
    );
    return mapDelivery(result.rows[0]!);
  }

  async getDeliveryByOrder(orderId: string): Promise<CoverageDelivery | null> {
    const db = getPool();
    const result = await db.query<DeliveryRow>(
      `SELECT * FROM coverage_deliveries WHERE order_id = $1`,
      [orderId]
    );
    return result.rows[0] ? mapDelivery(result.rows[0]) : null;
  }

  // ── Reviews ──────────────────────────────────────────────────────────

  async createReview(orderId: string, writerUserId: string, providerId: string, input: CoverageReviewCreateRequest): Promise<CoverageReview> {
    const db = getPool();
    const id = `crev_${randomUUID()}`;
    const result = await db.query<ReviewRow>(
      `INSERT INTO coverage_reviews (id, order_id, writer_user_id, provider_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, orderId, writerUserId, providerId, input.rating, input.comment ?? ""]
    );
    return mapReview(result.rows[0]!);
  }

  async getReviewByOrder(orderId: string): Promise<CoverageReview | null> {
    const db = getPool();
    const result = await db.query<ReviewRow>(
      `SELECT * FROM coverage_reviews WHERE order_id = $1`,
      [orderId]
    );
    return result.rows[0] ? mapReview(result.rows[0]) : null;
  }

  async listReviewsByProvider(providerId: string): Promise<CoverageReview[]> {
    const db = getPool();
    const result = await db.query<ReviewRow>(
      `SELECT * FROM coverage_reviews WHERE provider_id = $1 ORDER BY created_at DESC`,
      [providerId]
    );
    return result.rows.map(mapReview);
  }

  async updateProviderRating(providerId: string): Promise<void> {
    const db = getPool();
    const avgResult = await db.query<{ avg_rating: string | null }>(
      `SELECT AVG(rating)::text AS avg_rating FROM coverage_reviews WHERE provider_id = $1`,
      [providerId]
    );
    const avgRating = avgResult.rows[0]?.avg_rating ? Number(Number(avgResult.rows[0].avg_rating).toFixed(2)) : null;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coverage_reviews WHERE provider_id = $1`,
      [providerId]
    );
    const totalOrders = Number(countResult.rows[0]?.count ?? 0);

    await db.query(
      `UPDATE coverage_providers SET avg_rating = $2, total_orders_completed = $3, updated_at = NOW()
       WHERE id = $1`,
      [providerId, avgRating, totalOrders]
    );
  }

  // ── Disputes ─────────────────────────────────────────────────────────

  async createDispute(orderId: string, userId: string, input: CoverageDisputeCreateRequest): Promise<CoverageDispute> {
    const db = getPool();
    // Check for existing open disputes on this order
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM coverage_disputes WHERE order_id = $1 AND status IN ('open', 'under_review')`,
      [orderId]
    );
    if (existing.rows.length > 0) {
      throw new Error("An open dispute already exists for this order");
    }

    const id = `cdis_${randomUUID()}`;
    const result = await db.query<DisputeRow>(
      `INSERT INTO coverage_disputes (id, order_id, opened_by_user_id, reason, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, orderId, userId, input.reason, input.description]
    );
    return mapDispute(result.rows[0]!);
  }

  async getDispute(disputeId: string): Promise<CoverageDispute | null> {
    const db = getPool();
    const result = await db.query<DisputeRow>(
      `SELECT * FROM coverage_disputes WHERE id = $1`,
      [disputeId]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }

  async getDisputeByOrder(orderId: string): Promise<CoverageDispute | null> {
    const db = getPool();
    const result = await db.query<DisputeRow>(
      `SELECT * FROM coverage_disputes WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }

  async listDisputes(status?: CoverageDisputeStatus): Promise<CoverageDispute[]> {
    const db = getPool();
    let query = `SELECT * FROM coverage_disputes`;
    const values: unknown[] = [];
    if (status) {
      values.push(status);
      query += ` WHERE status = $1`;
    }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query<DisputeRow>(query, values);
    return result.rows.map(mapDispute);
  }

  async resolveDispute(disputeId: string, input: CoverageDisputeResolveRequest): Promise<CoverageDispute | null> {
    const db = getPool();
    const result = await db.query<DisputeRow>(
      `UPDATE coverage_disputes
       SET status = $2, admin_notes = $3, refund_amount_cents = $4, resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('open', 'under_review')
       RETURNING *`,
      [disputeId, input.status, input.adminNotes, input.refundAmountCents ?? null]
    );
    return result.rows[0] ? mapDispute(result.rows[0]) : null;
  }
}

// ── Row types & mappers ────────────────────────────────────────────────

type ProviderRow = {
  id: string;
  user_id: string;
  display_name: string;
  bio: string;
  specialties: string[];
  status: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  avg_rating: string | null;
  total_orders_completed: number;
  created_at: Date;
  updated_at: Date;
};

function mapProvider(row: ProviderRow): CoverageProvider {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    specialties: row.specialties,
    status: row.status as CoverageProvider["status"],
    stripeAccountId: row.stripe_account_id,
    stripeOnboardingComplete: row.stripe_onboarding_complete,
    avgRating: row.avg_rating ? Number(row.avg_rating) : null,
    totalOrdersCompleted: row.total_orders_completed,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

type ServiceRow = {
  id: string;
  provider_id: string;
  title: string;
  description: string;
  tier: string;
  price_cents: number;
  currency: string;
  turnaround_days: number;
  max_pages: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapService(row: ServiceRow): CoverageService {
  return {
    id: row.id,
    providerId: row.provider_id,
    title: row.title,
    description: row.description,
    tier: row.tier as CoverageService["tier"],
    priceCents: row.price_cents,
    currency: row.currency,
    turnaroundDays: row.turnaround_days,
    maxPages: row.max_pages,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

type OrderRow = {
  id: string;
  writer_user_id: string;
  provider_id: string;
  service_id: string;
  script_id: string;
  project_id: string;
  status: string;
  price_cents: number;
  platform_fee_cents: number;
  provider_payout_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  sla_deadline: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapOrder(row: OrderRow): CoverageOrder {
  return {
    id: row.id,
    writerUserId: row.writer_user_id,
    providerId: row.provider_id,
    serviceId: row.service_id,
    scriptId: row.script_id,
    projectId: row.project_id,
    status: row.status as CoverageOrder["status"],
    priceCents: row.price_cents,
    platformFeeCents: row.platform_fee_cents,
    providerPayoutCents: row.provider_payout_cents,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeTransferId: row.stripe_transfer_id,
    slaDeadline: row.sla_deadline?.toISOString() ?? null,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

type DeliveryRow = {
  id: string;
  order_id: string;
  summary: string;
  strengths: string;
  weaknesses: string;
  recommendations: string;
  score: number | null;
  file_key: string | null;
  file_name: string | null;
  created_at: Date;
};

function mapDelivery(row: DeliveryRow): CoverageDelivery {
  return {
    id: row.id,
    orderId: row.order_id,
    summary: row.summary,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendations: row.recommendations,
    score: row.score,
    fileKey: row.file_key,
    fileName: row.file_name,
    createdAt: row.created_at.toISOString()
  };
}

type ReviewRow = {
  id: string;
  order_id: string;
  writer_user_id: string;
  provider_id: string;
  rating: number;
  comment: string;
  created_at: Date;
};

function mapReview(row: ReviewRow): CoverageReview {
  return {
    id: row.id,
    orderId: row.order_id,
    writerUserId: row.writer_user_id,
    providerId: row.provider_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at.toISOString()
  };
}

type DisputeRow = {
  id: string;
  order_id: string;
  opened_by_user_id: string;
  reason: string;
  description: string;
  status: string;
  admin_notes: string | null;
  refund_amount_cents: number | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapDispute(row: DisputeRow): CoverageDispute {
  return {
    id: row.id,
    orderId: row.order_id,
    openedByUserId: row.opened_by_user_id,
    reason: row.reason as CoverageDispute["reason"],
    description: row.description,
    status: row.status as CoverageDispute["status"],
    adminNotes: row.admin_notes,
    refundAmountCents: row.refund_amount_cents,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
