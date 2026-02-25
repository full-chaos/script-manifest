import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CoverageProviderCreateRequestSchema,
  CoverageProviderUpdateRequestSchema,
  CoverageProviderReviewRequestSchema,
  CoverageProviderFiltersSchema,
  CoverageServiceCreateRequestSchema,
  CoverageServiceUpdateRequestSchema,
  CoverageServiceFiltersSchema,
  CoverageOrderCreateRequestSchema,
  CoverageOrderFiltersSchema,
  CoverageDeliveryCreateRequestSchema,
  CoverageReviewCreateRequestSchema,
  CoverageDisputeCreateRequestSchema,
  CoverageDisputeResolveRequestSchema
} from "@script-manifest/contracts";
import type { CoverageMarketplaceRepository } from "./repository.js";
import { PgCoverageMarketplaceRepository } from "./pgRepository.js";
import { type PaymentGateway, MemoryPaymentGateway } from "./paymentGateway.js";
import { StripePaymentGateway } from "./stripePaymentGateway.js";

export type CoverageMarketplaceServiceOptions = {
  logger?: boolean;
  repository?: CoverageMarketplaceRepository;
  paymentGateway?: PaymentGateway;
  commissionRate?: number;
};

function createPaymentGatewayFromEnv(): PaymentGateway {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secretKey && webhookSecret) {
    return new StripePaymentGateway(secretKey, webhookSecret);
  }
  return new MemoryPaymentGateway();
}

function monthBounds(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

export function buildServer(options: CoverageMarketplaceServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  const repository = options.repository ?? new PgCoverageMarketplaceRepository();
  const paymentGateway = options.paymentGateway ?? createPaymentGatewayFromEnv();
  const commissionRate = options.commissionRate ?? Number(process.env.PLATFORM_COMMISSION_RATE ?? "0.15");
  const autoCompleteDays = Number(process.env.COVERAGE_AUTO_COMPLETE_DAYS ?? "7");
  const maintenanceIntervalMs = Number(process.env.COVERAGE_SLA_MAINTENANCE_MS ?? "0");
  const systemUserId = process.env.COVERAGE_SYSTEM_USER_ID ?? "system";
  let maintenanceTimer: NodeJS.Timeout | null = null;

  const getAuthUserId = (headers: Record<string, unknown>): string | null => {
    const userId = headers["x-auth-user-id"];
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  };

  server.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? "120"),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    allowList: []
  });

  const runSlaMaintenance = async (actorUserId: string) => {
    const now = Date.now();
    const autoCompleteCutoff = now - autoCompleteDays * 86400000;
    const deliveredOrders = await repository.listOrders({ status: "delivered", limit: 1000, offset: 0 });
    let autoCompleted = 0;

    for (const order of deliveredOrders) {
      const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt).getTime() : null;
      if (!deliveredAt || deliveredAt > autoCompleteCutoff) {
        continue;
      }
      const provider = await repository.getProvider(order.providerId);
      if (!provider?.stripeAccountId) {
        continue;
      }
      if (order.stripePaymentIntentId) {
        await paymentGateway.capturePayment(order.stripePaymentIntentId);
      }
      const { transferId } = await paymentGateway.transferToProvider({
        amountCents: order.providerPayoutCents,
        stripeAccountId: provider.stripeAccountId,
        transferGroup: order.id
      });
      await repository.updateOrderStatus(order.id, "completed", { stripeTransferId: transferId });
      autoCompleted += 1;
    }

    const claimed = await repository.listOrders({ status: "claimed", limit: 1000, offset: 0 });
    const inProgress = await repository.listOrders({ status: "in_progress", limit: 1000, offset: 0 });
    let slaBreachesDisputed = 0;
    for (const order of [...claimed, ...inProgress]) {
      const deadline = order.slaDeadline ? new Date(order.slaDeadline).getTime() : null;
      if (!deadline || deadline >= now) {
        continue;
      }
      const existingDispute = await repository.getDisputeByOrder(order.id);
      if (existingDispute && (existingDispute.status === "open" || existingDispute.status === "under_review")) {
        continue;
      }

      const dispute = await repository.createDispute(order.id, actorUserId, {
        reason: "non_delivery",
        description: "Auto-opened after SLA deadline elapsed."
      });
      await repository.updateOrderStatus(order.id, "disputed");
      await repository.createDisputeEvent({
        disputeId: dispute.id,
        actorUserId,
        eventType: "sla_breach_auto_open",
        note: "SLA deadline exceeded; dispute opened automatically.",
        fromStatus: null,
        toStatus: "open"
      });
      slaBreachesDisputed += 1;
    }

    return { autoCompleted, slaBreachesDisputed };
  };

  server.addHook("onReady", async () => {
    await repository.init();
    if (maintenanceIntervalMs > 0) {
      maintenanceTimer = setInterval(() => {
        void runSlaMaintenance(systemUserId).catch((error) => {
          server.log.error({ error }, "sla maintenance run failed");
        });
      }, maintenanceIntervalMs);
      server.log.info({ maintenanceIntervalMs }, "scheduled SLA maintenance job");
    }
  });

  server.addHook("onClose", async () => {
    if (maintenanceTimer) {
      clearInterval(maintenanceTimer);
      maintenanceTimer = null;
    }
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
    return reply.status(ok ? 200 : 503).send({ service: "coverage-marketplace-service", ok, checks });
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
    return reply.status(ok ? 200 : 503).send({ service: "coverage-marketplace-service", ok, checks });
  });

  // ── Provider Routes ────────────────────────────────────────────────

  server.post("/internal/providers", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageProviderCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    // Check if user already has a provider profile
    const existing = await repository.getProviderByUserId(authUserId);
    if (existing) {
      return reply.status(409).send({ error: "provider_already_exists" });
    }

    // Create provider
    const provider = await repository.createProvider(authUserId, parsed.data);

    // Create Stripe Connect account
    const email = `provider-${authUserId}@example.com`; // Placeholder email
    const { accountId, onboardingUrl } = await paymentGateway.createConnectAccount(email);

    // Update provider with Stripe account ID
    await repository.updateProviderStripe(provider.id, accountId, false);

    const updatedProvider = await repository.getProvider(provider.id);

    return reply.status(201).send({ provider: updatedProvider, onboardingUrl });
  });

  server.get("/internal/providers", async (req, reply) => {
    const parsed = CoverageProviderFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }
    const providers = await repository.listProviders(parsed.data);
    return reply.send({ providers });
  });

  server.get("/internal/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    return reply.send({ provider });
  });

  server.patch("/internal/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    if (provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageProviderUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const updated = await repository.updateProvider(providerId, parsed.data);
    return reply.send({ provider: updated });
  });

  server.get("/internal/providers/:providerId/stripe-onboarding", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    if (provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    if (!provider.stripeAccountId) {
      return reply.status(400).send({ error: "no_stripe_account" });
    }

    // Check account status
    const status = await paymentGateway.getAccountStatus(provider.stripeAccountId);
    if (
      status.chargesEnabled &&
      status.payoutsEnabled &&
      !provider.stripeOnboardingComplete &&
      provider.status === "pending_verification"
    ) {
      // Update provider status
      await repository.updateProviderStripe(provider.id, provider.stripeAccountId, true);
    }

    // Generate new onboarding link
    const { url } = await paymentGateway.createAccountLink(provider.stripeAccountId);
    return reply.send({ url });
  });

  server.get("/internal/admin/providers/review-queue", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const providers = await repository.listProviders({
      status: "pending_verification",
      limit: 100,
      offset: 0
    });

    const entries = await Promise.all(
      providers.map(async (provider) => {
        const reviews = await repository.listProviderReviews(provider.id);
        return {
          provider,
          latestReview: reviews[0] ?? null
        };
      })
    );

    return reply.send({ entries });
  });

  server.post("/internal/admin/providers/:providerId/review", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { providerId } = req.params as { providerId: string };
    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }

    const parsed = CoverageProviderReviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }
    const input = parsed.data;
    if ((input.decision === "rejected" || input.decision === "suspended") && !input.reason) {
      return reply.status(400).send({ error: "reason_required" });
    }

    const review = await repository.createProviderReview(provider.id, authUserId, input);

    let nextStatus: "pending_verification" | "active" | "suspended" | "deactivated" = provider.status;
    if (input.decision === "approved") {
      nextStatus = provider.stripeOnboardingComplete ? "active" : "pending_verification";
    } else if (input.decision === "rejected") {
      nextStatus = "deactivated";
    } else if (input.decision === "suspended") {
      nextStatus = "suspended";
    }

    const updatedProvider = await repository.updateProviderStatus(provider.id, nextStatus);
    return reply.send({ provider: updatedProvider, review });
  });

  // ── Service Routes ─────────────────────────────────────────────────

  server.post("/internal/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    if (provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (provider.status !== "active") {
      return reply.status(403).send({ error: "provider_not_active" });
    }

    const parsed = CoverageServiceCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const service = await repository.createService(providerId, parsed.data);
    return reply.status(201).send({ service });
  });

  server.get("/internal/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const services = await repository.listServicesByProvider(providerId);
    return reply.send({ services });
  });

  server.patch("/internal/services/:serviceId", async (req, reply) => {
    const { serviceId } = req.params as { serviceId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const service = await repository.getService(serviceId);
    if (!service) {
      return reply.status(404).send({ error: "service_not_found" });
    }

    const provider = await repository.getProvider(service.providerId);
    if (!provider || provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageServiceUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const updated = await repository.updateService(serviceId, parsed.data);
    return reply.send({ service: updated });
  });

  server.get("/internal/services", async (req, reply) => {
    const parsed = CoverageServiceFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }
    const services = await repository.listServices(parsed.data);
    return reply.send({ services });
  });

  // ── Order Routes ───────────────────────────────────────────────────

  server.post("/internal/orders", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageOrderCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const service = await repository.getService(parsed.data.serviceId);
    if (!service) {
      return reply.status(404).send({ error: "service_not_found" });
    }

    const provider = await repository.getProvider(service.providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }

    const priceCents = service.priceCents;
    const platformFeeCents = Math.round(priceCents * commissionRate);
    const providerPayoutCents = priceCents - platformFeeCents;

    // Create payment intent
    const { intentId, clientSecret } = await paymentGateway.createPaymentIntent({
      amountCents: priceCents,
      currency: "usd",
      metadata: {
        serviceId: service.id,
        providerId: provider.id,
        writerUserId: authUserId
      }
    });

    // Create order
    const order = await repository.createOrder({
      writerUserId: authUserId,
      providerId: provider.id,
      serviceId: service.id,
      scriptId: parsed.data.scriptId,
      projectId: parsed.data.projectId,
      priceCents,
      platformFeeCents,
      providerPayoutCents,
      stripePaymentIntentId: intentId
    });

    return reply.status(201).send({ order, clientSecret });
  });

  server.get("/internal/orders", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageOrderFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }

    const orders = await repository.listOrders(parsed.data);
    return reply.send({ orders });
  });

  server.get("/internal/orders/:orderId", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }

    // Verify auth user is writer or provider
    const provider = await repository.getProvider(order.providerId);
    if (order.writerUserId !== authUserId && provider?.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return reply.send({ order });
  });

  server.post("/internal/orders/:orderId/claim", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "payment_held") {
      return reply.status(409).send({ error: "order_not_claimable" });
    }

    const provider = await repository.getProvider(order.providerId);
    if (!provider || provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    // Get service to find turnaround time
    const service = await repository.getService(order.serviceId);
    if (!service) {
      return reply.status(404).send({ error: "service_not_found" });
    }

    const slaDeadline = new Date(Date.now() + service.turnaroundDays * 86400000).toISOString();
    const updated = await repository.updateOrderStatus(orderId, "claimed", { slaDeadline });

    return reply.send({ order: updated });
  });

  server.post("/internal/orders/:orderId/deliver", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "claimed" && order.status !== "in_progress") {
      return reply.status(409).send({ error: "order_not_deliverable" });
    }

    const provider = await repository.getProvider(order.providerId);
    if (!provider || provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageDeliveryCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    // Create delivery
    const delivery = await repository.createDelivery(orderId, parsed.data);

    // Update order status
    const deliveredAt = new Date().toISOString();
    await repository.updateOrderStatus(orderId, "delivered", { deliveredAt });

    return reply.send({ delivery });
  });

  server.post("/internal/orders/:orderId/complete", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "delivered") {
      return reply.status(409).send({ error: "order_not_completable" });
    }
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const provider = await repository.getProvider(order.providerId);
    if (!provider || !provider.stripeAccountId) {
      return reply.status(400).send({ error: "provider_stripe_not_configured" });
    }

    if (order.stripePaymentIntentId) {
      await paymentGateway.capturePayment(order.stripePaymentIntentId);
    }

    // Transfer payment to provider
    const { transferId } = await paymentGateway.transferToProvider({
      amountCents: order.providerPayoutCents,
      stripeAccountId: provider.stripeAccountId!,
      transferGroup: orderId
    });

    // Update order status
    const updated = await repository.updateOrderStatus(orderId, "completed", { stripeTransferId: transferId });

    // Update provider rating
    await repository.updateProviderRating(order.providerId);

    return reply.send({ order: updated });
  });

  server.post("/internal/orders/:orderId/cancel", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "placed" && order.status !== "payment_held") {
      return reply.status(409).send({ error: "order_not_cancellable" });
    }
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    // Refund payment
    if (order.stripePaymentIntentId) {
      await paymentGateway.refund(order.stripePaymentIntentId);
    }

    // Update order status
    const updated = await repository.updateOrderStatus(orderId, "cancelled");

    return reply.send({ order: updated });
  });

  // ── Delivery Routes ────────────────────────────────────────────────

  server.get("/internal/orders/:orderId/delivery", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }

    // Verify auth user is writer or provider
    const provider = await repository.getProvider(order.providerId);
    if (order.writerUserId !== authUserId && provider?.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const delivery = await repository.getDeliveryByOrder(orderId);
    if (!delivery) {
      return reply.status(404).send({ error: "delivery_not_found" });
    }

    return reply.send({ delivery });
  });

  server.get("/internal/orders/:orderId/delivery/upload-url", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    const provider = await repository.getProvider(order.providerId);
    if (!provider || provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const bucket = process.env.COVERAGE_DELIVERY_BUCKET ?? "scripts";
    const objectPrefix = process.env.COVERAGE_DELIVERY_PREFIX ?? "coverage-deliveries";
    const uploadUrl = process.env.COVERAGE_DELIVERY_UPLOAD_URL ?? (process.env.MINIO_ENDPOINT ?? "http://minio:9000");
    const key = `${objectPrefix}/${orderId}/${Date.now()}-coverage-report.pdf`;

    return reply.send({
      uploadUrl,
      method: "POST",
      uploadFields: {
        key,
        bucket,
        "Content-Type": "application/pdf"
      }
    });
  });

  // ── Review Routes ──────────────────────────────────────────────────

  server.post("/internal/orders/:orderId/review", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "delivered" && order.status !== "completed") {
      return reply.status(409).send({ error: "order_not_reviewable" });
    }
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    // Check if review already exists
    const existingReview = await repository.getReviewByOrder(orderId);
    if (existingReview) {
      return reply.status(409).send({ error: "review_already_exists" });
    }

    const parsed = CoverageReviewCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const review = await repository.createReview(orderId, authUserId, order.providerId, parsed.data);

    // Update provider rating
    await repository.updateProviderRating(order.providerId);

    return reply.status(201).send({ review });
  });

  server.get("/internal/providers/:providerId/reviews", async (req, reply) => {
    const { providerId } = req.params as { providerId: string };
    const reviews = await repository.listReviewsByProvider(providerId);
    return reply.send({ reviews });
  });

  // ── Dispute Routes ─────────────────────────────────────────────────

  server.post("/internal/orders/:orderId/dispute", async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.status !== "delivered") {
      return reply.status(409).send({ error: "order_not_disputable" });
    }
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    // Check if dispute already exists
    const existingDispute = await repository.getDisputeByOrder(orderId);
    if (existingDispute) {
      return reply.status(409).send({ error: "dispute_already_exists" });
    }

    const parsed = CoverageDisputeCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const dispute = await repository.createDispute(orderId, authUserId, {
      reason: parsed.data.reason,
      description: parsed.data.description
    });

    // Update order status to disputed
    await repository.updateOrderStatus(orderId, "disputed");
    await repository.createDisputeEvent({
      disputeId: dispute.id,
      actorUserId: authUserId,
      eventType: "opened",
      note: parsed.data.description,
      fromStatus: null,
      toStatus: "open"
    });

    return reply.status(201).send({ dispute });
  });

  server.get("/internal/disputes", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { status } = req.query as { status?: string };
    const validStatuses = ["open", "under_review", "resolved_refund", "resolved_no_refund", "resolved_partial"];
    const filterStatus = status && validStatuses.includes(status)
      ? status as Parameters<typeof repository.listDisputes>[0]
      : undefined;
    const disputes = await repository.listDisputes(filterStatus);
    return reply.send({ disputes });
  });

  server.get("/internal/disputes/:disputeId/events", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const { disputeId } = req.params as { disputeId: string };
    const dispute = await repository.getDispute(disputeId);
    if (!dispute) {
      return reply.status(404).send({ error: "dispute_not_found" });
    }
    const events = await repository.listDisputeEvents(disputeId);
    return reply.send({ events });
  });

  server.patch("/internal/disputes/:disputeId", async (req, reply) => {
    const { disputeId } = req.params as { disputeId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsed = CoverageDisputeResolveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const dispute = await repository.getDispute(disputeId);
    if (!dispute) {
      return reply.status(404).send({ error: "dispute_not_found" });
    }

    const resolved = await repository.resolveDispute(disputeId, parsed.data);
    if (!resolved) {
      return reply.status(409).send({ error: "dispute_not_resolvable" });
    }

    const order = await repository.getOrder(dispute.orderId);
    if (!order) {
      return reply.send({ dispute: resolved });
    }

    if (parsed.data.status === "resolved_partial" && !parsed.data.refundAmountCents) {
      return reply.status(400).send({ error: "refund_amount_required_for_partial" });
    }

    if (parsed.data.status === "resolved_refund" || parsed.data.status === "resolved_partial") {
      if (order.stripePaymentIntentId) {
        await paymentGateway.refund(order.stripePaymentIntentId, parsed.data.refundAmountCents);
        await repository.updateOrderStatus(order.id, "refunded");
      }
    } else if (parsed.data.status === "resolved_no_refund") {
      const provider = await repository.getProvider(order.providerId);
      if (!provider || !provider.stripeAccountId) {
        return reply.status(400).send({ error: "provider_stripe_not_configured" });
      }
      if (order.stripePaymentIntentId) {
        await paymentGateway.capturePayment(order.stripePaymentIntentId);
      }
      const { transferId } = await paymentGateway.transferToProvider({
        amountCents: order.providerPayoutCents,
        stripeAccountId: provider.stripeAccountId,
        transferGroup: order.id
      });
      await repository.updateOrderStatus(order.id, "completed", { stripeTransferId: transferId });
    }

    await repository.createDisputeEvent({
      disputeId: dispute.id,
      actorUserId: authUserId,
      eventType: "resolved",
      note: parsed.data.adminNotes,
      fromStatus: dispute.status,
      toStatus: resolved.status
    });

    return reply.send({ dispute: resolved });
  });

  // ── Provider Earnings & Ledger Routes ─────────────────────────────

  server.get("/internal/providers/:providerId/earnings-statement", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { providerId } = req.params as { providerId: string };
    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    if (provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const query = req.query as { month?: string; format?: string };
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const month = query.month ?? defaultMonth;
    const bounds = monthBounds(month);
    if (!bounds) {
      return reply.status(400).send({ error: "invalid_month" });
    }

    const completed = await repository.listOrders({
      providerId,
      status: "completed",
      limit: 1000,
      offset: 0
    });
    const refunded = await repository.listOrders({
      providerId,
      status: "refunded",
      limit: 1000,
      offset: 0
    });
    const all = [...completed, ...refunded];
    const rows = all
      .filter((order) => {
        const at = new Date(order.updatedAt).getTime();
        return at >= bounds.start.getTime() && at < bounds.end.getTime();
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((order) => ({
        orderId: order.id,
        status: order.status,
        updatedAt: order.updatedAt,
        grossCents: order.priceCents,
        platformFeeCents: order.platformFeeCents,
        providerPayoutCents: order.status === "completed" ? order.providerPayoutCents : 0,
        transferId: order.stripeTransferId
      }));

    const summary = rows.reduce(
      (acc, row) => {
        acc.grossCents += row.grossCents;
        acc.platformFeeCents += row.platformFeeCents;
        acc.providerPayoutCents += row.providerPayoutCents;
        return acc;
      },
      { grossCents: 0, platformFeeCents: 0, providerPayoutCents: 0 }
    );

    if (query.format === "csv") {
      const header = [
        "order_id",
        "status",
        "updated_at",
        "gross_cents",
        "platform_fee_cents",
        "provider_payout_cents",
        "transfer_id"
      ].join(",");
      const csvLines = rows.map((row) => [
        csvEscape(row.orderId),
        csvEscape(row.status),
        csvEscape(row.updatedAt),
        csvEscape(row.grossCents),
        csvEscape(row.platformFeeCents),
        csvEscape(row.providerPayoutCents),
        csvEscape(row.transferId)
      ].join(","));
      const csv = [header, ...csvLines].join("\n");
      reply.header("content-type", "text/csv; charset=utf-8");
      return reply.send(csv);
    }

    return reply.send({ month, providerId, summary, rows });
  });

  server.get("/internal/admin/payout-ledger", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const query = req.query as { month?: string; format?: string };
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const month = query.month ?? defaultMonth;
    const bounds = monthBounds(month);
    if (!bounds) {
      return reply.status(400).send({ error: "invalid_month" });
    }

    const completed = await repository.listOrders({ status: "completed", limit: 2000, offset: 0 });
    const refunded = await repository.listOrders({ status: "refunded", limit: 2000, offset: 0 });
    const rows = [...completed, ...refunded]
      .filter((order) => {
        const at = new Date(order.updatedAt).getTime();
        return at >= bounds.start.getTime() && at < bounds.end.getTime();
      })
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .map((order) => ({
        orderId: order.id,
        providerId: order.providerId,
        writerUserId: order.writerUserId,
        status: order.status,
        updatedAt: order.updatedAt,
        grossCents: order.priceCents,
        platformFeeCents: order.platformFeeCents,
        providerPayoutCents: order.status === "completed" ? order.providerPayoutCents : 0,
        transferId: order.stripeTransferId,
        paymentIntentId: order.stripePaymentIntentId
      }));

    if (query.format === "csv") {
      const header = [
        "order_id",
        "provider_id",
        "writer_user_id",
        "status",
        "updated_at",
        "gross_cents",
        "platform_fee_cents",
        "provider_payout_cents",
        "transfer_id",
        "payment_intent_id"
      ].join(",");
      const csvLines = rows.map((row) => [
        csvEscape(row.orderId),
        csvEscape(row.providerId),
        csvEscape(row.writerUserId),
        csvEscape(row.status),
        csvEscape(row.updatedAt),
        csvEscape(row.grossCents),
        csvEscape(row.platformFeeCents),
        csvEscape(row.providerPayoutCents),
        csvEscape(row.transferId),
        csvEscape(row.paymentIntentId)
      ].join(","));
      const csv = [header, ...csvLines].join("\n");
      reply.header("content-type", "text/csv; charset=utf-8");
      return reply.send(csv);
    }

    return reply.send({ month, rows });
  });

  // ── Jobs & SLA Automation ──────────────────────────────────────────

  server.post("/internal/jobs/sla-maintenance", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const result = await runSlaMaintenance(authUserId);
    return reply.send(result);
  });

  // ── Webhook Route ──────────────────────────────────────────────────

  server.post("/internal/stripe-webhook", async (req, reply) => {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      return reply.status(400).send({ error: "missing_signature" });
    }

    let payload: string;
    if (typeof req.body === "string") {
      payload = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      payload = req.body.toString("utf8");
    } else {
      payload = JSON.stringify(req.body ?? {});
    }

    let event: any;
    try {
      event = paymentGateway.constructWebhookEvent(
        payload,
        signature
      );
    } catch (error) {
      server.log.warn({ error }, "webhook signature verification failed");
      return reply.status(400).send({ error: "invalid_signature" });
    }

    // Handle events
    if (event.type === "payment_intent.amount_capturable_updated") {
      const intentId = event.data?.object?.id;
      if (intentId) {
        // Find order and update status
        const orders = await repository.listOrders({ offset: 0, limit: 1000 });
        const order = orders.find((o) => o.stripePaymentIntentId === intentId);
        if (order && order.status === "placed") {
          await repository.updateOrderStatus(order.id, "payment_held");
        }
      }
    } else if (event.type === "account.updated") {
      const accountId = event.data?.object?.id;
      if (accountId) {
        // Find provider and update status
        const providers = await repository.listProviders({ offset: 0, limit: 1000 });
        const provider = providers.find((p) => p.stripeAccountId === accountId);
        if (provider) {
          const object = event.data?.object ?? {};
          const webhookChargesEnabled =
            typeof object.charges_enabled === "boolean"
              ? object.charges_enabled
              : typeof object.chargesEnabled === "boolean"
                ? object.chargesEnabled
                : undefined;
          const webhookPayoutsEnabled =
            typeof object.payouts_enabled === "boolean"
              ? object.payouts_enabled
              : typeof object.payoutsEnabled === "boolean"
                ? object.payoutsEnabled
                : undefined;

          let chargesEnabled: boolean;
          let payoutsEnabled: boolean;
          if (webhookChargesEnabled !== undefined && webhookPayoutsEnabled !== undefined) {
            chargesEnabled = webhookChargesEnabled;
            payoutsEnabled = webhookPayoutsEnabled;
          } else {
            const accountStatus = await paymentGateway.getAccountStatus(accountId);
            chargesEnabled = webhookChargesEnabled ?? accountStatus.chargesEnabled;
            payoutsEnabled = webhookPayoutsEnabled ?? accountStatus.payoutsEnabled;
          }
          const onboardingComplete = Boolean(chargesEnabled && payoutsEnabled);
          if (provider.status === "pending_verification") {
            await repository.updateProviderStripe(provider.id, accountId, onboardingComplete);
          } else {
            await repository.updateProviderStripe(provider.id, accountId, onboardingComplete);
          }
        }
      }
    }

    return reply.send({ received: true });
  });

  return server;
}

function warnMissingEnv(recommended: string[]): void {
  const missing = recommended.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[coverage-marketplace-service] Missing recommended env vars: ${missing.join(", ")}`);
  }
}

export async function startServer(): Promise<void> {
  warnMissingEnv(["DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  const port = Number(process.env.PORT ?? 4008);
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
