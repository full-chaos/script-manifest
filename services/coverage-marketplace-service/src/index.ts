import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CoverageProviderCreateRequestSchema,
  CoverageProviderUpdateRequestSchema,
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

export type CoverageMarketplaceServiceOptions = {
  logger?: boolean;
  repository?: CoverageMarketplaceRepository;
  paymentGateway?: PaymentGateway;
  commissionRate?: number;
};

export function buildServer(options: CoverageMarketplaceServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  const repository = options.repository ?? new PgCoverageMarketplaceRepository();
  const paymentGateway = options.paymentGateway ?? new MemoryPaymentGateway();
  const commissionRate = options.commissionRate ?? Number(process.env.PLATFORM_COMMISSION_RATE ?? "0.15");

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
    if (status.chargesEnabled && status.payoutsEnabled && !provider.stripeOnboardingComplete) {
      // Update provider status
      await repository.updateProviderStripe(provider.id, provider.stripeAccountId, true);
    }

    // Generate new onboarding link
    const { url } = await paymentGateway.createAccountLink(provider.stripeAccountId);
    return reply.send({ url });
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

    return reply.status(201).send({ dispute });
  });

  server.get("/internal/disputes", async (req, reply) => {
    const { status } = req.query as { status?: string };
    const validStatuses = ["open", "under_review", "resolved_refund", "resolved_no_refund", "dismissed"];
    const filterStatus = status && validStatuses.includes(status)
      ? status as Parameters<typeof repository.listDisputes>[0]
      : undefined;
    const disputes = await repository.listDisputes(filterStatus);
    return reply.send({ disputes });
  });

  server.patch("/internal/disputes/:disputeId", async (req, reply) => {
    const { disputeId } = req.params as { disputeId: string };

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

    // If refund, process it
    if (parsed.data.status === "resolved_refund") {
      const order = await repository.getOrder(dispute.orderId);
      if (order && order.stripePaymentIntentId) {
        await paymentGateway.refund(order.stripePaymentIntentId);
        await repository.updateOrderStatus(order.id, "refunded");
      }
    }

    return reply.send({ dispute: resolved });
  });

  // ── Webhook Route ──────────────────────────────────────────────────

  server.post("/internal/stripe-webhook", async (req, reply) => {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      return reply.status(400).send({ error: "missing_signature" });
    }

    let event: any;
    try {
      event = paymentGateway.constructWebhookEvent(
        JSON.stringify(req.body),
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
          const status = await paymentGateway.getAccountStatus(accountId);
          if (status.chargesEnabled && status.payoutsEnabled) {
            await repository.updateProviderStripe(provider.id, accountId, true);
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
  warnMissingEnv(["DATABASE_URL", "STRIPE_SECRET_KEY"]);
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
