import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { Counter } from "prom-client";
import { bootstrapService, registerMetrics, setupErrorReporting, validateRequiredEnv, getAuthUserId, isMainModule, readHeader } from "@script-manifest/service-utils";
import { closePool, healthCheck } from "@script-manifest/db";
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
import { createScheduler } from "./scheduler.js";
import { PgUserPaymentProfileRepository, type UserPaymentProfileRepository } from "./userPaymentProfileRepository.js";
import { getInitialRetryAt } from "./paymentRetry.js";

const coverageOrdersCounter = new Counter({
  name: "coverage_orders_total",
  help: "Total number of coverage orders by status",
  labelNames: ["status"] as const,
});

export type CoverageMarketplaceServiceOptions = {
  logger?: boolean;
  repository?: CoverageMarketplaceRepository;
  userPaymentProfileRepository?: UserPaymentProfileRepository;
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

const DECLINE_REASON_BY_CODE: Record<string, string> = {
  insufficient_funds: "Insufficient funds",
  expired_card: "Card expired",
  card_declined: "Card declined",
  incorrect_cvc: "Incorrect security code",
  lost_card: "Card reported lost",
  stolen_card: "Card reported stolen",
};

function mapDeclineCodeToReason(declineCode?: string): string {
  if (!declineCode) {
    return "Payment declined";
  }
  return DECLINE_REASON_BY_CODE[declineCode] ?? "Payment declined";
}

async function transferToProviderOrQueueRetry(params: {
  orderId: string;
  amountCents: number;
  stripeAccountId: string;
  idempotencyKey: string;
  paymentGateway: PaymentGateway;
  repository: CoverageMarketplaceRepository;
  logger: FastifyInstance["log"];
}): Promise<{ transferId: string | null; queued: boolean }> {
  try {
    const { transferId } = await params.paymentGateway.transferToProvider({
      amountCents: params.amountCents,
      stripeAccountId: params.stripeAccountId,
      transferGroup: params.orderId,
      idempotencyKey: params.idempotencyKey,
    });
    return { transferId, queued: false };
  } catch (error) {
    await params.repository.createRetryQueueEntry(params.orderId, getInitialRetryAt());
    params.logger.warn({ error, orderId: params.orderId }, "provider transfer failed; queued retry");
    return { transferId: null, queued: true };
  }
}

export function buildServer(options: CoverageMarketplaceServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  const repository = options.repository ?? new PgCoverageMarketplaceRepository();
  const userPaymentProfileRepository = options.userPaymentProfileRepository ?? new PgUserPaymentProfileRepository();
  const runHealthCheck = options.repository ? () => repository.healthCheck() : healthCheck;
  const paymentGateway = options.paymentGateway ?? createPaymentGatewayFromEnv();
  const commissionRate = options.commissionRate ?? Number(process.env.PLATFORM_COMMISSION_RATE ?? "0.15");
  const autoCompleteDays = Number(process.env.COVERAGE_AUTO_COMPLETE_DAYS ?? "7");
  const maintenanceIntervalMs = Number(process.env.COVERAGE_SLA_MAINTENANCE_MS ?? "0");
  const systemUserId = process.env.COVERAGE_SYSTEM_USER_ID ?? "system";
  const scheduler = createScheduler({
    repository,
    paymentGateway,
    autoCompleteDays,
    systemUserId,
    logger: server.log,
  });

  server.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? "120"),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    allowList: []
  });

  // lgtm [js/missing-rate-limiting] Background maintenance hook is scheduler-driven, not request-driven.
  server.addHook("onReady", async () => {
    await repository.init();
    scheduler.start(maintenanceIntervalMs);
    if (maintenanceIntervalMs > 0) {
      server.log.info({ maintenanceIntervalMs }, "scheduled SLA maintenance job");
    }
  });

  server.addHook("onClose", async () => {
    scheduler.stop();
    await closePool();
  });

  // ── Health ─────────────────────────────────────────────────────────

  server.get("/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};
    try {
      const result = await runHealthCheck();
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
      const result = await runHealthCheck();
      checks.database = result.database;
    } catch {
      checks.database = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: "coverage-marketplace-service", ok, checks });
  });

  // ── Provider Routes ────────────────────────────────────────────────

  server.post("/internal/providers", async (req, reply) => {
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { providerId: string } }>("/internal/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params;
    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    return reply.send({ provider });
  });

  server.patch<{ Params: { providerId: string } }>("/internal/providers/:providerId", async (req, reply) => {
    const { providerId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { providerId: string } }>("/internal/providers/:providerId/stripe-onboarding", async (req, reply) => {
    const { providerId } = req.params;
    const authUserId = getAuthUserId(req);
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
    const authUserId = getAuthUserId(req);
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

  server.post<{ Params: { providerId: string } }>("/internal/admin/providers/:providerId/review", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { providerId } = req.params;
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

  server.post<{ Params: { providerId: string } }>("/internal/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { providerId: string } }>("/internal/providers/:providerId/services", async (req, reply) => {
    const { providerId } = req.params;
    const services = await repository.listServicesByProvider(providerId);
    return reply.send({ services });
  });

  server.patch<{ Params: { serviceId: string } }>("/internal/services/:serviceId", async (req, reply) => {
    const { serviceId } = req.params;
    const authUserId = getAuthUserId(req);
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
    const authUserId = getAuthUserId(req);
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

    let userPaymentProfile = await userPaymentProfileRepository.findByUserId(authUserId);
    if (!userPaymentProfile) {
      const email = readHeader(req, "x-auth-user-email") ?? `${authUserId}@example.com`;
      const name =
        readHeader(req, "x-auth-user-display-name") ??
        readHeader(req, "x-auth-user-name") ??
        authUserId;
      const { customerId } = await paymentGateway.createCustomer({
        email,
        name,
        metadata: { userId: authUserId },
        idempotencyKey: `idem_cust_${authUserId}`
      });
      await userPaymentProfileRepository.create(authUserId, customerId);
      userPaymentProfile = { stripeCustomerId: customerId };
    }

    // Create payment intent
    const { intentId, clientSecret } = await paymentGateway.createPaymentIntentWithCustomer({
      amountCents: priceCents,
      currency: "usd",
      customerId: userPaymentProfile.stripeCustomerId,
      setupFutureUsage: "on_session",
      metadata: {
        serviceId: service.id,
        providerId: provider.id,
        writerUserId: authUserId
      },
      idempotencyKey: `idem_pi_${req.id}`
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

    coverageOrdersCounter.inc({ status: "created" });
    return reply.status(201).send({ order, clientSecret });
  });

  server.get("/internal/orders", async (req, reply) => {
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { orderId: string } }>("/internal/orders/:orderId", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.post<{ Params: { id: string } }>("/internal/coverage/orders/:id/retry-payment", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(req.params.id);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    if (order.status !== "payment_failed") {
      return reply.status(409).send({ error: "order_not_retryable" });
    }

    const userPaymentProfile = await userPaymentProfileRepository.findByUserId(authUserId);
    if (!userPaymentProfile) {
      return reply.status(409).send({ error: "payment_profile_not_found" });
    }

    const { intentId, clientSecret } = await paymentGateway.createPaymentIntentWithCustomer({
      amountCents: order.priceCents,
      currency: "usd",
      customerId: userPaymentProfile.stripeCustomerId,
      setupFutureUsage: "on_session",
      metadata: {
        serviceId: order.serviceId,
        providerId: order.providerId,
        writerUserId: authUserId,
      },
      idempotencyKey: `idem_retry_pi_${req.id}`,
    });

    await repository.updateOrderStatus(order.id, "placed", {
      stripePaymentIntentId: intentId,
      paymentFailureReason: null,
    });

    return reply.send({ clientSecret });
  });

  // ── My Orders (transaction history) ──────────────────────────────

  server.get("/internal/coverage/my-orders", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const rawQuery = req.query as Record<string, unknown>;
    const limit = Math.min(Math.max(Number(rawQuery.limit ?? 20), 1), 100);
    const offset = Math.max(Number(rawQuery.offset ?? 0), 0);
    const status = typeof rawQuery.status === "string" ? rawQuery.status : undefined;

    const orders = await repository.listOrders({
      writerUserId: authUserId,
      limit,
      offset,
      ...(status ? { status: status as Parameters<typeof repository.listOrders>[0]["status"] } : {})
    });

    // Enrich with service name
    const items = await Promise.all(orders.map(async (o) => {
      const svc = await repository.getService(o.serviceId);
      return {
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        priceCents: o.priceCents,
        serviceName: svc?.title ?? "",
        receiptUrl: o.receiptUrl ?? null
      };
    }));

    return reply.send({ orders: items });
  });

  // ── Invoice endpoint ───────────────────────────────────────────────

  server.get<{ Params: { orderId: string } }>("/internal/coverage/orders/:orderId/invoice", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const order = await repository.getOrder(orderId);
    if (!order) {
      return reply.status(404).send({ error: "order_not_found" });
    }

    // Only the writer who placed the order can fetch the invoice
    if (order.writerUserId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return reply.send({ invoiceUrl: order.receiptUrl ?? null });
  });

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/claim", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/deliver", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/complete", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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
      await paymentGateway.capturePayment(order.stripePaymentIntentId, `idem_capture_${orderId}`);
    }

    const { transferId, queued } = await transferToProviderOrQueueRetry({
      orderId,
      amountCents: order.providerPayoutCents,
      stripeAccountId: provider.stripeAccountId,
      idempotencyKey: `idem_transfer_${orderId}`,
      paymentGateway,
      repository,
      logger: server.log,
    });

    if (queued || !transferId) {
      return reply.status(202).send({ order, queuedForRetry: true });
    }

    // Update order status
    const updated = await repository.updateOrderStatus(orderId, "completed", { stripeTransferId: transferId });

    // Update provider rating
    await repository.updateProviderRating(order.providerId);

    return reply.send({ order: updated });
  });

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/cancel", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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
      await paymentGateway.refund(order.stripePaymentIntentId, undefined, `idem_refund_${orderId}`);
    }

    // Update order status
    const updated = await repository.updateOrderStatus(orderId, "cancelled");

    return reply.send({ order: updated });
  });

  // ── Delivery Routes ────────────────────────────────────────────────

  server.get<{ Params: { orderId: string } }>("/internal/orders/:orderId/delivery", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { orderId: string } }>("/internal/orders/:orderId/delivery/upload-url", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/review", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.get<{ Params: { providerId: string } }>("/internal/providers/:providerId/reviews", async (req, reply) => {
    const { providerId } = req.params;
    const reviews = await repository.listReviewsByProvider(providerId);
    return reply.send({ reviews });
  });

  // ── Dispute Routes ─────────────────────────────────────────────────

  server.post<{ Params: { orderId: string } }>("/internal/orders/:orderId/dispute", async (req, reply) => {
    const { orderId } = req.params;
    const authUserId = getAuthUserId(req);
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

  server.get<{ Querystring: { status?: string } }>("/internal/disputes", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { status } = req.query;
    const validStatuses = ["open", "under_review", "resolved_refund", "resolved_no_refund", "resolved_partial"];
    const filterStatus = status && validStatuses.includes(status)
      ? status as Parameters<typeof repository.listDisputes>[0]
      : undefined;
    const disputes = await repository.listDisputes(filterStatus);
    return reply.send({ disputes });
  });

  server.get<{ Params: { disputeId: string } }>("/internal/disputes/:disputeId/events", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const { disputeId } = req.params;
    const dispute = await repository.getDispute(disputeId);
    if (!dispute) {
      return reply.status(404).send({ error: "dispute_not_found" });
    }
    const events = await repository.listDisputeEvents(disputeId);
    return reply.send({ events });
  });

  server.patch<{ Params: { disputeId: string } }>("/internal/disputes/:disputeId", async (req, reply) => {
    const { disputeId } = req.params;
    const authUserId = getAuthUserId(req);
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

    // Validate refundAmountCents BEFORE writing to DB to avoid inconsistent state
    const order = await repository.getOrder(dispute.orderId);
    if (parsed.data.status === "resolved_partial") {
      if (!parsed.data.refundAmountCents || parsed.data.refundAmountCents <= 0) {
        return reply.status(400).send({ error: "refund_amount_required_for_partial" });
      }
      if (order && parsed.data.refundAmountCents > order.priceCents) {
        return reply.status(400).send({ error: "refund_exceeds_order_amount" });
      }
    } else if (parsed.data.status === "resolved_refund") {
      if (parsed.data.refundAmountCents !== undefined && order && parsed.data.refundAmountCents > order.priceCents) {
        return reply.status(400).send({ error: "refund_exceeds_order_amount" });
      }
    }

    const resolved = await repository.resolveDispute(disputeId, parsed.data);
    if (!resolved) {
      return reply.status(409).send({ error: "dispute_not_resolvable" });
    }
    if (!order) {
      return reply.send({ dispute: resolved });
    }

    if (parsed.data.status === "resolved_refund" || parsed.data.status === "resolved_partial") {
      if (order.stripePaymentIntentId) {
        await paymentGateway.refund(order.stripePaymentIntentId, parsed.data.refundAmountCents, `idem_refund_${order.id}`);
        await repository.updateOrderStatus(order.id, "refunded");
      }
    } else if (parsed.data.status === "resolved_no_refund") {
      const provider = await repository.getProvider(order.providerId);
      if (!provider || !provider.stripeAccountId) {
        return reply.status(400).send({ error: "provider_stripe_not_configured" });
      }
      if (order.stripePaymentIntentId) {
        await paymentGateway.capturePayment(order.stripePaymentIntentId, `idem_capture_${order.id}`);
      }
      const { transferId, queued } = await transferToProviderOrQueueRetry({
        orderId: order.id,
        amountCents: order.providerPayoutCents,
        stripeAccountId: provider.stripeAccountId,
        idempotencyKey: `idem_transfer_${order.id}`,
        paymentGateway,
        repository,
        logger: server.log,
      });
      if (queued || !transferId) {
        return reply.status(202).send({ dispute: resolved, queuedForRetry: true });
      }
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

  server.get<{ Params: { providerId: string }; Querystring: { month?: string; format?: string } }>("/internal/providers/:providerId/earnings-statement", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const { providerId } = req.params;
    const provider = await repository.getProvider(providerId);
    if (!provider) {
      return reply.status(404).send({ error: "provider_not_found" });
    }
    if (provider.userId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const query = req.query;
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

  server.get<{ Querystring: { month?: string; format?: string } }>("/internal/admin/payout-ledger", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const query = req.query;
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

  server.post("/internal/jobs/sla-maintenance", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }
    const result = await scheduler.runOnce();
    return reply.send(result);
  });

  // ── Webhook Route ──────────────────────────────────────────────────
  // Register in an isolated plugin scope so the raw body parser only
  // applies to this route and does not override the default JSON parser
  // for all other routes in the server.
  server.register(async (webhookScope) => {
    // Parse the body as a raw Buffer so Stripe HMAC verification uses the
    // original wire bytes rather than a re-serialized JSON string.
    webhookScope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: Buffer) => void) => {
        done(null, body);
      }
    );

    webhookScope.post("/internal/stripe-webhook", async (req, reply) => {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      return reply.status(400).send({ error: "missing_signature" });
    }

    // req.body is a Buffer due to the raw content-type parser registered above.
    const payload = (req.body as Buffer).toString("utf8");

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

    // Log the webhook event (deduplicates by event ID)
    const logEntry = await repository.logWebhookEvent({
      eventId: event.id ?? `unknown_${randomUUID()}`,
      eventType: event.type,
      payload: event
    });

    if (logEntry.alreadyProcessed) {
      server.log.info({ eventId: event.id }, "duplicate webhook event skipped");
      return reply.send({ received: true });
    }

    try {
      // Handle events
      if (event.type === "payment_intent.amount_capturable_updated") {
        const intentId = event.data?.object?.id;
        if (intentId) {
          // Find order and update status
          const order = await repository.findOrderByPaymentIntentId(intentId);
          if (order && order.status === "placed") {
            await repository.updateOrderStatus(order.id, "payment_held");
            // Store receipt URL from the charge
            try {
              const receiptUrl = await paymentGateway.getReceiptUrl(intentId);
              if (receiptUrl) {
                await repository.updateOrderStatus(order.id, "payment_held", { receiptUrl });
              }
            } catch (receiptErr) {
              server.log.warn({ receiptErr }, "failed to fetch receipt URL");
            }
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
            await repository.updateProviderStripe(provider.id, accountId, onboardingComplete);
          }
        }
      } else if (event.type === "payment_intent.canceled") {
        const intentId = event.data?.object?.id;
        if (intentId) {
          const order = await repository.findOrderByPaymentIntentId(intentId);
          if (order && order.status !== "cancelled") {
            await repository.updateOrderStatus(order.id, "cancelled");
          }
        }
      } else if (event.type === "charge.failed") {
        const paymentIntentId = event.data?.object?.payment_intent;
        const declineCode = event.data?.object?.payment_method_details?.card?.decline_code ?? event.data?.object?.decline_code;
        const paymentFailureReason = mapDeclineCodeToReason(declineCode);
        if (paymentIntentId) {
          const order = await repository.findOrderByPaymentIntentId(paymentIntentId);
          if (order && (order.status === "placed" || order.status === "payment_held")) {
            await repository.updateOrderStatus(order.id, "payment_failed", { paymentFailureReason });
          }
        }
      } else if (event.type === "charge.refunded") {
        const paymentIntentId = event.data?.object?.payment_intent;
        if (paymentIntentId) {
          const order = await repository.findOrderByPaymentIntentId(paymentIntentId);
          if (order && order.status !== "refunded") {
            await repository.updateOrderStatus(order.id, "refunded");
          }
        }
      } else if (event.type === "charge.dispute.created") {
        const paymentIntentId = event.data?.object?.payment_intent;
        if (paymentIntentId) {
          const order = await repository.findOrderByPaymentIntentId(paymentIntentId);
          if (order && order.status !== "disputed") {
            await repository.updateOrderStatus(order.id, "disputed");
          }
        }
      } else if (event.type === "transfer.failed") {
        server.log.warn({ eventId: event.id, transfer: event.data?.object?.id }, "transfer.failed webhook received");
      } else if (event.type === "payout.failed") {
        server.log.warn({ eventId: event.id, payout: event.data?.object?.id }, "payout.failed webhook received");
      }

      await repository.updateWebhookLogStatus(logEntry.id, "processed");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await repository.updateWebhookLogStatus(logEntry.id, "failed", errorMessage);
      server.log.error({ error: err, eventType: event.type }, "webhook processing failed");
    }

    return reply.send({ received: true });
    });
  }); // end webhook plugin scope

  // ── Payment Method Routes ──────────────────────────────────────────

  server.get("/internal/coverage/payment-methods", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const profile = await userPaymentProfileRepository.findByUserId(authUserId);
    if (!profile) {
      return reply.send({ paymentMethods: [] });
    }

    const paymentMethods = await paymentGateway.listPaymentMethods(profile.stripeCustomerId);
    return reply.send({ paymentMethods });
  });

  server.delete<{ Params: { id: string } }>("/internal/coverage/payment-methods/:id", async (req, reply) => {
    const authUserId = getAuthUserId(req);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const profile = await userPaymentProfileRepository.findByUserId(authUserId);
    if (!profile) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const userMethods = await paymentGateway.listPaymentMethods(profile.stripeCustomerId);
    const { id } = req.params;
    const owned = userMethods.some((m) => m.id === id);
    if (!owned) {
      return reply.status(403).send({ error: "forbidden" });
    }

    await paymentGateway.detachPaymentMethod(id);
    return reply.status(204).send();
  });


  return server;
}

export async function startServer(): Promise<void> {
  const boot = bootstrapService("coverage-marketplace-service");
  setupErrorReporting("coverage-marketplace-service");
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { setupTracing } = await import("@script-manifest/service-utils/tracing");
    const tracingSdk = setupTracing("coverage-marketplace-service");
    if (tracingSdk) {
      process.once("SIGTERM", () => {
        tracingSdk.shutdown().catch((err) => server.log.error(err, "OTel SDK shutdown error"));
      });
    }
    boot.phase("tracing initialized");
  }
  validateRequiredEnv(["DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  boot.phase("env validated");
  const port = Number(process.env.PORT ?? 4008);
  const server = buildServer();
  boot.phase("server built");
  // Register Prometheus metrics endpoint (only in production server startup, not tests).
  await registerMetrics(server);
  await server.listen({ port, host: "0.0.0.0" });
  boot.ready(port);
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => { process.stderr.write(String(error) + "\n"); process.exit(1); });
}
