import assert from "node:assert/strict";
import test from "node:test";
import type {
  CoverageProvider,
  CoverageProviderCreateRequest,
  CoverageProviderUpdateRequest,
  CoverageProviderFilters,
  CoverageProviderReview,
  CoverageProviderReviewRequest,
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
  CoverageDisputeEvent,
  CoverageDisputeStatus
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { CoverageMarketplaceRepository } from "./repository.js";
import { MemoryPaymentGateway } from "./paymentGateway.js";

class MemoryCoverageMarketplaceRepository implements CoverageMarketplaceRepository {
  private providers = new Map<string, CoverageProvider>();
  private services = new Map<string, CoverageService>();
  private orders = new Map<string, CoverageOrder>();
  private deliveries = new Map<string, CoverageDelivery>();
  private reviews = new Map<string, CoverageReview>();
  private disputes = new Map<string, CoverageDispute>();
  private providerReviews = new Map<string, CoverageProviderReview>();
  private disputeEvents = new Map<string, CoverageDisputeEvent>();
  private nextId = 1;

  async init() {}
  async healthCheck() {
    return { database: true };
  }

  private id(prefix: string) {
    return `${prefix}_${String(this.nextId++)}`;
  }

  // ── Providers ────────────────────────────────────────────────────────

  async createProvider(userId: string, input: CoverageProviderCreateRequest): Promise<CoverageProvider> {
    const provider: CoverageProvider = {
      id: this.id("cprov"),
      userId,
      displayName: input.displayName,
      bio: input.bio,
      specialties: input.specialties,
      status: "pending_verification",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      avgRating: null,
      totalOrdersCompleted: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.providers.set(provider.id, provider);
    return provider;
  }

  async getProvider(providerId: string): Promise<CoverageProvider | null> {
    return this.providers.get(providerId) ?? null;
  }

  async getProviderByUserId(userId: string): Promise<CoverageProvider | null> {
    for (const provider of this.providers.values()) {
      if (provider.userId === userId) return provider;
    }
    return null;
  }

  async updateProvider(providerId: string, input: CoverageProviderUpdateRequest): Promise<CoverageProvider | null> {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    if (input.displayName !== undefined) provider.displayName = input.displayName;
    if (input.bio !== undefined) provider.bio = input.bio;
    if (input.specialties !== undefined) provider.specialties = input.specialties;
    provider.updatedAt = new Date().toISOString();
    return provider;
  }

  async updateProviderStripe(providerId: string, stripeAccountId: string, onboardingComplete: boolean): Promise<CoverageProvider | null> {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    provider.stripeAccountId = stripeAccountId;
    provider.stripeOnboardingComplete = onboardingComplete;
    if (onboardingComplete && provider.status === "pending_verification") {
      provider.status = "active";
    }
    provider.updatedAt = new Date().toISOString();
    return provider;
  }

  async updateProviderStatus(providerId: string, status: string): Promise<CoverageProvider | null> {
    const provider = this.providers.get(providerId);
    if (!provider) return null;
    provider.status = status as CoverageProvider["status"];
    provider.updatedAt = new Date().toISOString();
    return provider;
  }

  async listProviders(filters: CoverageProviderFilters): Promise<CoverageProvider[]> {
    let results = Array.from(this.providers.values());
    if (filters.status) {
      results = results.filter((p) => p.status === filters.status);
    }
    if (filters.specialty) {
      results = results.filter((p) => p.specialties.includes(filters.specialty!));
    }
    return results.slice(0, filters.limit ?? 30);
  }

  async createProviderReview(providerId: string, reviewedByUserId: string, input: CoverageProviderReviewRequest): Promise<CoverageProviderReview> {
    const review: CoverageProviderReview = {
      id: this.id("cprv"),
      providerId,
      reviewedByUserId,
      decision: input.decision,
      reason: input.reason ?? null,
      checklist: input.checklist ?? [],
      createdAt: new Date().toISOString()
    };
    this.providerReviews.set(review.id, review);
    return review;
  }

  async listProviderReviews(providerId: string): Promise<CoverageProviderReview[]> {
    return Array.from(this.providerReviews.values()).filter((review) => review.providerId === providerId);
  }

  // ── Services ─────────────────────────────────────────────────────────

  async createService(providerId: string, input: CoverageServiceCreateRequest): Promise<CoverageService> {
    const service: CoverageService = {
      id: this.id("csvc"),
      providerId,
      title: input.title,
      description: input.description,
      tier: input.tier,
      priceCents: input.priceCents,
      currency: input.currency,
      turnaroundDays: input.turnaroundDays,
      maxPages: input.maxPages,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.services.set(service.id, service);
    return service;
  }

  async getService(serviceId: string): Promise<CoverageService | null> {
    return this.services.get(serviceId) ?? null;
  }

  async updateService(serviceId: string, input: CoverageServiceUpdateRequest): Promise<CoverageService | null> {
    const service = this.services.get(serviceId);
    if (!service) return null;
    if (input.title !== undefined) service.title = input.title;
    if (input.description !== undefined) service.description = input.description;
    if (input.priceCents !== undefined) service.priceCents = input.priceCents;
    if (input.turnaroundDays !== undefined) service.turnaroundDays = input.turnaroundDays;
    if (input.maxPages !== undefined) service.maxPages = input.maxPages;
    if (input.active !== undefined) service.active = input.active;
    service.updatedAt = new Date().toISOString();
    return service;
  }

  async listServicesByProvider(providerId: string): Promise<CoverageService[]> {
    return Array.from(this.services.values()).filter((s) => s.providerId === providerId);
  }

  async listServices(filters: CoverageServiceFilters): Promise<CoverageService[]> {
    let results = Array.from(this.services.values());
    if (filters.providerId) {
      results = results.filter((s) => s.providerId === filters.providerId);
    }
    if (filters.tier) {
      results = results.filter((s) => s.tier === filters.tier);
    }
    if (filters.minPrice !== undefined) {
      results = results.filter((s) => s.priceCents >= filters.minPrice!);
    }
    if (filters.maxPrice !== undefined) {
      results = results.filter((s) => s.priceCents <= filters.maxPrice!);
    }
    return results.slice(0, filters.limit);
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
    const order: CoverageOrder = {
      id: this.id("cord"),
      writerUserId: params.writerUserId,
      providerId: params.providerId,
      serviceId: params.serviceId,
      scriptId: params.scriptId,
      projectId: params.projectId,
      priceCents: params.priceCents,
      platformFeeCents: params.platformFeeCents,
      providerPayoutCents: params.providerPayoutCents,
      status: "placed" as CoverageOrder["status"],
      stripePaymentIntentId: params.stripePaymentIntentId,
      stripeTransferId: null,
      slaDeadline: null,
      deliveredAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(orderId: string): Promise<CoverageOrder | null> {
    return this.orders.get(orderId) ?? null;
  }

  async listOrders(filters: CoverageOrderFilters): Promise<CoverageOrder[]> {
    let results = Array.from(this.orders.values());
    if (filters.writerUserId) {
      results = results.filter((o) => o.writerUserId === filters.writerUserId);
    }
    if (filters.providerId) {
      results = results.filter((o) => o.providerId === filters.providerId);
    }
    if (filters.status) {
      results = results.filter((o) => o.status === filters.status);
    }
    return results.slice(0, filters.limit ?? 30);
  }

  async updateOrderStatus(orderId: string, status: string, extra?: Partial<{
    stripePaymentIntentId: string;
    stripeTransferId: string;
    slaDeadline: string;
    deliveredAt: string;
  }>): Promise<CoverageOrder | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    order.status = status as CoverageOrder["status"];
    if (extra?.stripePaymentIntentId) order.stripePaymentIntentId = extra.stripePaymentIntentId;
    if (extra?.stripeTransferId) order.stripeTransferId = extra.stripeTransferId;
    if (extra?.slaDeadline) order.slaDeadline = extra.slaDeadline;
    if (extra?.deliveredAt) order.deliveredAt = extra.deliveredAt;
    order.updatedAt = new Date().toISOString();
    return order;
  }

  // ── Deliveries ───────────────────────────────────────────────────────

  async createDelivery(orderId: string, input: CoverageDeliveryCreateRequest): Promise<CoverageDelivery> {
    const delivery: CoverageDelivery = {
      id: this.id("cdel"),
      orderId,
      summary: input.summary,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      recommendations: input.recommendations,
      score: input.score ?? null,
      fileKey: input.fileKey ?? null,
      fileName: input.fileName ?? null,
      createdAt: new Date().toISOString()
    };
    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }

  async getDeliveryByOrder(orderId: string): Promise<CoverageDelivery | null> {
    for (const delivery of this.deliveries.values()) {
      if (delivery.orderId === orderId) return delivery;
    }
    return null;
  }

  // ── Reviews ──────────────────────────────────────────────────────────

  async createReview(orderId: string, writerUserId: string, providerId: string, input: CoverageReviewCreateRequest): Promise<CoverageReview> {
    const review: CoverageReview = {
      id: this.id("crev"),
      orderId,
      writerUserId,
      providerId,
      rating: input.rating,
      comment: input.comment,
      createdAt: new Date().toISOString()
    };
    this.reviews.set(review.id, review);
    return review;
  }

  async getReviewByOrder(orderId: string): Promise<CoverageReview | null> {
    for (const review of this.reviews.values()) {
      if (review.orderId === orderId) return review;
    }
    return null;
  }

  async listReviewsByProvider(providerId: string): Promise<CoverageReview[]> {
    return Array.from(this.reviews.values()).filter((r) => r.providerId === providerId);
  }

  async updateProviderRating(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    const providerReviews = await this.listReviewsByProvider(providerId);
    if (providerReviews.length === 0) {
      provider.avgRating = null;
      provider.totalOrdersCompleted = 0;
    } else {
      const sum = providerReviews.reduce((acc, r) => acc + r.rating, 0);
      provider.avgRating = Number((sum / providerReviews.length).toFixed(2));
      provider.totalOrdersCompleted = providerReviews.length;
    }
    provider.updatedAt = new Date().toISOString();
  }

  // ── Disputes ─────────────────────────────────────────────────────────

  async createDispute(orderId: string, userId: string, input: CoverageDisputeCreateRequest): Promise<CoverageDispute> {
    const dispute: CoverageDispute = {
      id: this.id("cdisp"),
      orderId,
      openedByUserId: userId,
      reason: input.reason,
      description: input.description,
      status: "open",
      adminNotes: null,
      refundAmountCents: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.disputes.set(dispute.id, dispute);
    return dispute;
  }

  async getDispute(disputeId: string): Promise<CoverageDispute | null> {
    return this.disputes.get(disputeId) ?? null;
  }

  async getDisputeByOrder(orderId: string): Promise<CoverageDispute | null> {
    for (const dispute of this.disputes.values()) {
      if (dispute.orderId === orderId) return dispute;
    }
    return null;
  }

  async listDisputes(status?: CoverageDisputeStatus): Promise<CoverageDispute[]> {
    let results = Array.from(this.disputes.values());
    if (status) {
      results = results.filter((d) => d.status === status);
    }
    return results;
  }

  async resolveDispute(disputeId: string, input: CoverageDisputeResolveRequest): Promise<CoverageDispute | null> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute || (dispute.status !== "open" && dispute.status !== "under_review")) return null;
    dispute.status = input.status;
    dispute.adminNotes = input.adminNotes;
    dispute.refundAmountCents = input.refundAmountCents ?? null;
    dispute.resolvedAt = new Date().toISOString();
    dispute.updatedAt = new Date().toISOString();
    return dispute;
  }

  async createDisputeEvent(params: {
    disputeId: string;
    actorUserId: string;
    eventType: string;
    note?: string | null;
    fromStatus?: CoverageDisputeStatus | null;
    toStatus?: CoverageDisputeStatus | null;
  }): Promise<CoverageDisputeEvent> {
    const event: CoverageDisputeEvent = {
      id: this.id("cdie"),
      disputeId: params.disputeId,
      actorUserId: params.actorUserId,
      eventType: params.eventType,
      note: params.note ?? null,
      fromStatus: params.fromStatus ?? null,
      toStatus: params.toStatus ?? null,
      createdAt: new Date().toISOString()
    };
    this.disputeEvents.set(event.id, event);
    return event;
  }

  async listDisputeEvents(disputeId: string): Promise<CoverageDisputeEvent[]> {
    return Array.from(this.disputeEvents.values()).filter((event) => event.disputeId === disputeId);
  }
}

function createServer() {
  const repo = new MemoryCoverageMarketplaceRepository();
  const gateway = new MemoryPaymentGateway();
  const server = buildServer({
    logger: false,
    repository: repo,
    paymentGateway: gateway,
    commissionRate: 0.15
  });
  return { server, repo, gateway };
}

// ── Health Tests ─────────────────────────────────────────────────────

test("health endpoint returns ok", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test("health/live endpoint returns ok", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/health/live" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

// ── Provider Tests ───────────────────────────────────────────────────

test("create provider returns 201", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama", "thriller"]
    }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.provider);
  assert.ok(body.onboardingUrl);
  assert.equal(body.provider.displayName, "John Doe");
  assert.equal(body.provider.status, "pending_verification");
});

test("create provider returns 409 if already exists", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Create first provider
  await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });

  // Try to create second provider with same user
  const res = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "Jane Doe",
      bio: "Another consultant",
      specialties: ["comedy"]
    }
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "provider_already_exists");
});

test("get provider returns 200", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const createRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const providerId = createRes.json().provider.id;

  const res = await server.inject({
    method: "GET",
    url: `/internal/providers/${providerId}`
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().provider.displayName, "John Doe");
});

test("get provider returns 404 for unknown ID", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "GET",
    url: "/internal/providers/cprov_unknown"
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "provider_not_found");
});

test("update provider returns updated data", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const createRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const providerId = createRes.json().provider.id;

  const res = await server.inject({
    method: "PATCH",
    url: `/internal/providers/${providerId}`,
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      bio: "Updated bio"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().provider.bio, "Updated bio");
});

test("list providers returns array", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/providers"
  });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.json().providers));
  assert.equal(res.json().providers.length, 1);
});

test("admin provider review queue and review decisions work", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  const createRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "Review Me",
      bio: "Bio",
      specialties: ["drama"]
    }
  });
  const provider = createRes.json().provider;

  const queueRes = await server.inject({
    method: "GET",
    url: "/internal/admin/providers/review-queue",
    headers: { "x-auth-user-id": "admin_01" }
  });
  assert.equal(queueRes.statusCode, 200);
  assert.equal(queueRes.json().entries.length, 1);

  const missingReasonRes = await server.inject({
    method: "POST",
    url: `/internal/admin/providers/${provider.id}/review`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: {
      decision: "rejected"
    }
  });
  assert.equal(missingReasonRes.statusCode, 400);
  assert.equal(missingReasonRes.json().error, "reason_required");

  const reviewRes = await server.inject({
    method: "POST",
    url: `/internal/admin/providers/${provider.id}/review`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: {
      decision: "suspended",
      reason: "Verification mismatch",
      checklist: ["identity_verified", "portfolio_reviewed"]
    }
  });
  assert.equal(reviewRes.statusCode, 200);
  assert.equal(reviewRes.json().provider.status, "suspended");
  assert.equal(reviewRes.json().review.decision, "suspended");
});

// ── Service Tests ────────────────────────────────────────────────────

test("create service returns 201", async (t) => {
  const { server, gateway } = createServer();
  t.after(() => server.close());

  // Create provider
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  // Complete onboarding
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "user_01" }
  });

  // Create service
  const res = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.json().service.title, "Professional Coverage");
});

test("create service returns 403 if provider not active", async (t) => {
  const { server } = createServer();
  t.after(() => server.close());

  // Create provider (not active)
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  // Try to create service
  const res = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "provider_not_active");
});

test("list services returns active services", async (t) => {
  const { server, gateway } = createServer();
  t.after(() => server.close());

  // Create provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "user_01" }
  });

  await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "user_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });

  const res = await server.inject({
    method: "GET",
    url: "/internal/services"
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().services.length, 1);
});

// ── Order Flow Tests ─────────────────────────────────────────────────

test("place order returns 201 with clientSecret", async (t) => {
  const { server, gateway } = createServer();
  t.after(() => server.close());

  // Setup: create provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const res = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.order);
  assert.ok(body.clientSecret);
  assert.equal(body.order.status, "placed");
  assert.equal(body.order.priceCents, 15000);
});

test("claim order after payment_held returns 200", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Simulate payment_held
  await repo.updateOrderStatus(order.id, "payment_held");

  // Claim order
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/claim`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().order.status, "claimed");
  assert.ok(res.json().order.slaDeadline);
});

test("deliver order returns 200", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place and claim order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  await repo.updateOrderStatus(order.id, "claimed");

  // Deliver order
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/deliver`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      summary: "This is a strong script with good character development.",
      strengths: "Excellent dialogue and pacing.",
      weaknesses: "Some plot holes in Act 2.",
      recommendations: "Tighten the second act.",
      score: 85
    }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.json().delivery);
});

test("provider can request delivery upload URL", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_01", projectId: "project_01" }
  });
  const order = orderRes.json().order;
  await repo.updateOrderStatus(order.id, "payment_held");
  await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/claim`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const uploadUrlRes = await server.inject({
    method: "GET",
    url: `/internal/orders/${order.id}/delivery/upload-url`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  assert.equal(uploadUrlRes.statusCode, 200);
  const body = uploadUrlRes.json();
  assert.equal(body.method, "POST");
  assert.equal(typeof body.uploadUrl, "string");
  assert.ok(body.uploadFields.key.includes(order.id));
});

test("complete order triggers payment transfer", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Simulate order delivered
  await repo.updateOrderStatus(order.id, "delivered");

  // Complete order
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/complete`,
    headers: { "x-auth-user-id": "writer_01" }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().order.status, "completed");
  assert.ok(res.json().order.stripeTransferId);
  assert.equal(gateway.transfers.length, 1);
});

test("cancel order before claimed works", async (t) => {
  const { server, gateway } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Cancel order
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/cancel`,
    headers: { "x-auth-user-id": "writer_01" }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().order.status, "cancelled");
  assert.equal(gateway.refunds.length, 1);
});

test("cancel order after claimed returns 409", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Claim order
  await repo.updateOrderStatus(order.id, "claimed");

  // Try to cancel
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/cancel`,
    headers: { "x-auth-user-id": "writer_01" }
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "order_not_cancellable");
});

// ── Review Tests ─────────────────────────────────────────────────────

test("create review after delivery returns 201", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Simulate delivered
  await repo.updateOrderStatus(order.id, "delivered");

  // Create review
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/review`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      rating: 5,
      comment: "Excellent coverage!"
    }
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.json().review.rating, 5);
});

test("cannot review twice returns 409", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  await repo.updateOrderStatus(order.id, "delivered");

  // Create first review
  await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/review`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      rating: 5,
      comment: "Excellent coverage!"
    }
  });

  // Try second review
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/review`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      rating: 4,
      comment: "Another review"
    }
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "review_already_exists");
});

// ── Dispute Tests ────────────────────────────────────────────────────

test("open dispute on delivered order returns 201", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  await repo.updateOrderStatus(order.id, "delivered");

  // Open dispute
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      reason: "quality",
      description: "Coverage did not meet expectations"
    }
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.json().dispute.status, "open");
});

test("resolve dispute with refund works", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  await repo.updateOrderStatus(order.id, "delivered");

  // Open dispute
  const disputeRes = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      reason: "quality",
      description: "Coverage did not meet expectations"
    }
  });
  const dispute = disputeRes.json().dispute;

  // Resolve with refund
  const res = await server.inject({
    method: "PATCH",
    url: `/internal/disputes/${dispute.id}`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: {
      status: "resolved_refund",
      adminNotes: "Refund approved"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().dispute.status, "resolved_refund");
  assert.equal(gateway.refunds.length, 1);
});

test("resolve dispute with no refund completes order and logs events", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "John Doe", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_01", projectId: "project_01" }
  });
  const order = orderRes.json().order;
  await repo.updateOrderStatus(order.id, "delivered");

  const disputeRes = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { reason: "quality", description: "Needs review" }
  });
  const dispute = disputeRes.json().dispute;

  const resolveRes = await server.inject({
    method: "PATCH",
    url: `/internal/disputes/${dispute.id}`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: {
      status: "resolved_no_refund",
      adminNotes: "Coverage stands"
    }
  });
  assert.equal(resolveRes.statusCode, 200);
  assert.equal(resolveRes.json().dispute.status, "resolved_no_refund");
  assert.equal(gateway.transfers.length, 1);

  const updatedOrder = await repo.getOrder(order.id);
  assert.equal(updatedOrder?.status, "completed");

  const eventsRes = await server.inject({
    method: "GET",
    url: `/internal/disputes/${dispute.id}/events`,
    headers: { "x-auth-user-id": "admin_01" }
  });
  assert.equal(eventsRes.statusCode, 200);
  assert.equal(eventsRes.json().events.length, 2);
  assert.equal(eventsRes.json().events[0].eventType, "opened");
  assert.equal(eventsRes.json().events[1].eventType, "resolved");
});

test("resolve dispute partial refund requires refund amount", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "John Doe", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_01", projectId: "project_01" }
  });
  const order = orderRes.json().order;
  await repo.updateOrderStatus(order.id, "delivered");
  const disputeRes = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { reason: "quality", description: "Needs partial refund" }
  });
  const dispute = disputeRes.json().dispute;

  const resolveRes = await server.inject({
    method: "PATCH",
    url: `/internal/disputes/${dispute.id}`,
    headers: { "x-auth-user-id": "admin_01", "content-type": "application/json" },
    payload: {
      status: "resolved_partial",
      adminNotes: "Partial refund approved"
    }
  });
  assert.equal(resolveRes.statusCode, 400);
  assert.equal(resolveRes.json().error, "refund_amount_required_for_partial");
});

test("cannot dispute non-delivered order", async (t) => {
  const { server, gateway } = createServer();
  t.after(() => server.close());

  // Setup provider and service
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      displayName: "John Doe",
      bio: "Professional script consultant",
      specialties: ["drama"]
    }
  });
  const provider = providerRes.json().provider;

  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });

  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  // Place order (not delivered)
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      serviceId: service.id,
      scriptId: "script_01",
      projectId: "project_01"
    }
  });
  const order = orderRes.json().order;

  // Try to dispute
  const res = await server.inject({
    method: "POST",
    url: `/internal/orders/${order.id}/dispute`,
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: {
      reason: "quality",
      description: "Coverage did not meet expectations"
    }
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.json().error, "order_not_disputable");
});

test("provider earnings statement supports json and csv", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "John Doe", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;
  const orderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_01", projectId: "project_01" }
  });
  const order = orderRes.json().order;
  await repo.updateOrderStatus(order.id, "completed", { stripeTransferId: "tr_123" });

  const month = new Date().toISOString().slice(0, 7);
  const jsonRes = await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/earnings-statement?month=${month}`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  assert.equal(jsonRes.statusCode, 200);
  assert.equal(jsonRes.json().rows.length, 1);

  const csvRes = await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/earnings-statement?month=${month}&format=csv`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  assert.equal(csvRes.statusCode, 200);
  assert.match(csvRes.body, /order_id,status,updated_at/);
});

test("sla maintenance auto-completes delivered and opens dispute on breach", async (t) => {
  const { server, gateway, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "John Doe", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;
  gateway.completeOnboarding(provider.stripeAccountId!);
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const serviceRes = await server.inject({
    method: "POST",
    url: `/internal/providers/${provider.id}/services`,
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: {
      title: "Professional Coverage",
      description: "In-depth script analysis",
      tier: "competition_ready",
      priceCents: 15000,
      currency: "usd",
      turnaroundDays: 7,
      maxPages: 120
    }
  });
  const service = serviceRes.json().service;

  const deliveredOrderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_01", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_a", projectId: "project_a" }
  });
  const deliveredOrder = deliveredOrderRes.json().order;
  const staleDeliveredAt = new Date(Date.now() - 8 * 86400000).toISOString();
  await repo.updateOrderStatus(deliveredOrder.id, "delivered", { deliveredAt: staleDeliveredAt });

  const breachedOrderRes = await server.inject({
    method: "POST",
    url: "/internal/orders",
    headers: { "x-auth-user-id": "writer_02", "content-type": "application/json" },
    payload: { serviceId: service.id, scriptId: "script_b", projectId: "project_b" }
  });
  const breachedOrder = breachedOrderRes.json().order;
  const staleSla = new Date(Date.now() - 3600000).toISOString();
  await repo.updateOrderStatus(breachedOrder.id, "claimed", { slaDeadline: staleSla });

  const runRes = await server.inject({
    method: "POST",
    url: "/internal/jobs/sla-maintenance",
    headers: { "x-auth-user-id": "admin_01" }
  });
  assert.equal(runRes.statusCode, 200);
  assert.equal(runRes.json().autoCompleted, 1);
  assert.equal(runRes.json().slaBreachesDisputed, 1);

  const completedOrder = await repo.getOrder(deliveredOrder.id);
  assert.equal(completedOrder?.status, "completed");
  const disputedOrder = await repo.getOrder(breachedOrder.id);
  assert.equal(disputedOrder?.status, "disputed");
});

// ── Webhook Tests ─────────────────────────────────────────────────────

test("account.updated webhook with both fields present uses webhook values directly without fallback", async (t) => {
  const { server, repo, gateway } = createServer();
  t.after(() => server.close());

  // Create a provider
  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "Test Provider", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;

  // Trigger stripe-onboarding to assign a Stripe account ID
  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const updatedProvider = await repo.getProvider(provider.id);
  const accountId = updatedProvider!.stripeAccountId!;

  // Set gateway so getAccountStatus would return true if called (stale)
  gateway.accounts.set(accountId, { chargesEnabled: true, payoutsEnabled: true });

  // Send webhook with both fields explicitly false — should override stale gateway data
  const res = await server.inject({
    method: "POST",
    url: "/internal/stripe-webhook",
    headers: { "stripe-signature": "sig", "content-type": "application/json" },
    payload: {
      type: "account.updated",
      data: { object: { id: accountId, charges_enabled: false, payouts_enabled: false } }
    }
  });

  assert.equal(res.statusCode, 200);
  const refreshed = await repo.getProvider(provider.id);
  assert.equal(refreshed!.stripeOnboardingComplete, false);
});

test("account.updated webhook with both fields true marks onboarding complete", async (t) => {
  const { server, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "Test Provider", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;

  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const updatedProvider = await repo.getProvider(provider.id);
  const accountId = updatedProvider!.stripeAccountId!;

  const res = await server.inject({
    method: "POST",
    url: "/internal/stripe-webhook",
    headers: { "stripe-signature": "sig", "content-type": "application/json" },
    payload: {
      type: "account.updated",
      data: { object: { id: accountId, charges_enabled: true, payouts_enabled: true } }
    }
  });

  assert.equal(res.statusCode, 200);
  const refreshed = await repo.getProvider(provider.id);
  assert.equal(refreshed!.stripeOnboardingComplete, true);
});

test("account.updated does not reactivate suspended providers", async (t) => {
  const { server, repo } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "Test Provider", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;

  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  await repo.updateProviderStatus(provider.id, "suspended");
  const updatedProvider = await repo.getProvider(provider.id);
  const accountId = updatedProvider!.stripeAccountId!;

  const res = await server.inject({
    method: "POST",
    url: "/internal/stripe-webhook",
    headers: { "stripe-signature": "sig", "content-type": "application/json" },
    payload: {
      type: "account.updated",
      data: { object: { id: accountId, charges_enabled: true, payouts_enabled: true } }
    }
  });
  assert.equal(res.statusCode, 200);
  const refreshed = await repo.getProvider(provider.id);
  assert.equal(refreshed!.status, "suspended");
  assert.equal(refreshed!.stripeOnboardingComplete, true);
});

test("account.updated webhook with missing fields falls back to getAccountStatus", async (t) => {
  const { server, repo, gateway } = createServer();
  t.after(() => server.close());

  const providerRes = await server.inject({
    method: "POST",
    url: "/internal/providers",
    headers: { "x-auth-user-id": "provider_01", "content-type": "application/json" },
    payload: { displayName: "Test Provider", bio: "Bio", specialties: ["drama"] }
  });
  const provider = providerRes.json().provider;

  await server.inject({
    method: "GET",
    url: `/internal/providers/${provider.id}/stripe-onboarding`,
    headers: { "x-auth-user-id": "provider_01" }
  });
  const updatedProvider = await repo.getProvider(provider.id);
  const accountId = updatedProvider!.stripeAccountId!;

  // Set gateway to completed onboarding
  gateway.accounts.set(accountId, { chargesEnabled: true, payoutsEnabled: true });

  // Send webhook with neither field — should fall back to gateway
  const res = await server.inject({
    method: "POST",
    url: "/internal/stripe-webhook",
    headers: { "stripe-signature": "sig", "content-type": "application/json" },
    payload: {
      type: "account.updated",
      data: { object: { id: accountId } }
    }
  });

  assert.equal(res.statusCode, 200);
  const refreshed = await repo.getProvider(provider.id);
  assert.equal(refreshed!.stripeOnboardingComplete, true);
});
