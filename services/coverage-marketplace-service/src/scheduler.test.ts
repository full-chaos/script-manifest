import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { CoverageDispute, CoverageOrder, CoverageProvider } from "@script-manifest/contracts";
import { createScheduler } from "./scheduler.js";
import type { PaymentGateway } from "./paymentGateway.js";
import type { CoverageMarketplaceRepository } from "./repository.js";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

function createOrder(overrides: Partial<CoverageOrder>): CoverageOrder {
  return {
    id: "cord_1",
    writerUserId: "writer_1",
    providerId: "provider_1",
    serviceId: "service_1",
    scriptId: "script_1",
    projectId: "project_1",
    priceCents: 10000,
    platformFeeCents: 1500,
    providerPayoutCents: 8500,
    status: "delivered",
    stripePaymentIntentId: "pi_1",
    stripeTransferId: null,
    slaDeadline: null,
    deliveredAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    receiptUrl: null,
    paymentFailureReason: null,
    ...overrides,
  };
}

function createDispute(overrides: Partial<CoverageDispute>): CoverageDispute {
  return {
    id: "cdisp_1",
    orderId: "cord_1",
    openedByUserId: "writer_1",
    reason: "non_delivery",
    description: "existing",
    status: "open",
    adminNotes: null,
    refundAmountCents: null,
    resolvedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createDeps() {
  const deliveredOrders: CoverageOrder[] = [];
  const claimedOrders: CoverageOrder[] = [];
  const inProgressOrders: CoverageOrder[] = [];

  const providers = new Map<string, CoverageProvider>();
  const disputesByOrder = new Map<string, CoverageDispute | null>();

  const updateOrderStatusCalls: Array<{ orderId: string; status: string; extra?: Record<string, unknown> }> = [];
  const disputeEvents: Array<Record<string, unknown>> = [];
  const transferCalls: Array<{ amountCents: number; stripeAccountId: string; transferGroup?: string }> = [];
  const captureCalls: string[] = [];

  const repository = {
    listOrders: async ({ status }: { status?: string }) => {
      if (status === "delivered") return deliveredOrders;
      if (status === "claimed") return claimedOrders;
      if (status === "in_progress") return inProgressOrders;
      return [];
    },
    getProvider: async (providerId: string) => providers.get(providerId) ?? null,
    updateOrderStatus: async (orderId: string, status: string, extra?: Record<string, unknown>) => {
      updateOrderStatusCalls.push({ orderId, status, extra });
      return null;
    },
    getDisputeByOrder: async (orderId: string) => disputesByOrder.get(orderId) ?? null,
    createDispute: async (orderId: string, userId: string, input: { reason: CoverageDispute["reason"]; description: string }) =>
      createDispute({ id: `cdisp_${orderId}`, orderId, openedByUserId: userId, reason: input.reason, description: input.description }),
    createDisputeEvent: async (event: Record<string, unknown>) => {
      disputeEvents.push(event);
      return event as never;
    },
  } as unknown as CoverageMarketplaceRepository;

  const paymentGateway = {
    capturePayment: async (intentId: string) => {
      captureCalls.push(intentId);
    },
    transferToProvider: async (params: { amountCents: number; stripeAccountId: string; transferGroup?: string }) => {
      transferCalls.push(params);
      return { transferId: `tr_${params.transferGroup ?? "x"}` };
    },
  } as unknown as PaymentGateway;

  const logErrors: Array<Record<string, unknown>> = [];
  const logger = {
    error: (record: Record<string, unknown>) => {
      logErrors.push(record);
    },
  } as unknown as FastifyBaseLogger;

  return {
    deliveredOrders,
    claimedOrders,
    inProgressOrders,
    providers,
    disputesByOrder,
    updateOrderStatusCalls,
    disputeEvents,
    transferCalls,
    captureCalls,
    logErrors,
    scheduler: createScheduler({
      repository,
      paymentGateway,
      autoCompleteDays: 7,
      systemUserId: "system",
      logger,
    }),
  };
}

test("runOnce auto-completes delivered orders beyond cutoff", async () => {
  const deps = createDeps();
  const now = Date.now();

  deps.deliveredOrders.push(
    createOrder({
      id: "cord_old",
      providerId: "provider_old",
      deliveredAt: new Date(now - 8 * 86400000).toISOString(),
      stripePaymentIntentId: "pi_old",
      providerPayoutCents: 7000,
    })
  );
  deps.providers.set(
    "provider_old",
    {
      id: "provider_old",
      userId: "provider_user",
      displayName: "Provider",
      bio: "bio",
      specialties: [],
      status: "active",
      stripeAccountId: "acct_1",
      stripeOnboardingComplete: true,
      avgRating: null,
      totalOrdersCompleted: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
  );

  const result = await deps.scheduler.runOnce();

  assert.equal(result.autoCompleted, 1);
  assert.equal(result.slaBreachesDisputed, 0);
  assert.deepEqual(deps.captureCalls, ["pi_old"]);
  assert.equal(deps.transferCalls.length, 1);
  assert.equal(deps.updateOrderStatusCalls[0]?.status, "completed");
});

test("runOnce skips delivered orders without eligible provider/payment", async () => {
  const deps = createDeps();
  const now = Date.now();

  deps.deliveredOrders.push(
    createOrder({ id: "cord_recent", providerId: "provider_recent", deliveredAt: new Date(now - 2 * 86400000).toISOString() }),
    createOrder({ id: "cord_nostripe", providerId: "provider_nostripe", deliveredAt: new Date(now - 9 * 86400000).toISOString() })
  );
  deps.providers.set(
    "provider_nostripe",
    {
      id: "provider_nostripe",
      userId: "provider_user",
      displayName: "Provider",
      bio: "bio",
      specialties: [],
      status: "active",
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      avgRating: null,
      totalOrdersCompleted: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
  );

  const result = await deps.scheduler.runOnce();

  assert.equal(result.autoCompleted, 0);
  assert.equal(deps.captureCalls.length, 0);
  assert.equal(deps.transferCalls.length, 0);
  assert.equal(deps.updateOrderStatusCalls.length, 0);
});

test("runOnce auto-opens disputes for SLA breaches", async () => {
  const deps = createDeps();
  const now = Date.now();
  deps.claimedOrders.push(
    createOrder({
      id: "cord_claimed_breach",
      status: "claimed",
      slaDeadline: new Date(now - 1000).toISOString(),
      stripePaymentIntentId: null,
    })
  );
  deps.inProgressOrders.push(
    createOrder({
      id: "cord_progress_breach",
      status: "in_progress",
      slaDeadline: new Date(now - 1000).toISOString(),
      stripePaymentIntentId: null,
    })
  );

  const result = await deps.scheduler.runOnce();

  assert.equal(result.slaBreachesDisputed, 2);
  assert.equal(deps.updateOrderStatusCalls.filter((c) => c.status === "disputed").length, 2);
  assert.equal(deps.disputeEvents.length, 2);
});

test("runOnce does not open duplicate open or under_review disputes", async () => {
  const deps = createDeps();
  const now = Date.now();

  deps.claimedOrders.push(
    createOrder({ id: "cord_open", status: "claimed", slaDeadline: new Date(now - 1000).toISOString(), stripePaymentIntentId: null }),
    createOrder({ id: "cord_review", status: "claimed", slaDeadline: new Date(now - 1000).toISOString(), stripePaymentIntentId: null }),
    createOrder({ id: "cord_resolved", status: "claimed", slaDeadline: new Date(now - 1000).toISOString(), stripePaymentIntentId: null })
  );

  deps.disputesByOrder.set("cord_open", createDispute({ status: "open", orderId: "cord_open" }));
  deps.disputesByOrder.set("cord_review", createDispute({ status: "under_review", orderId: "cord_review" }));
  deps.disputesByOrder.set("cord_resolved", createDispute({ status: "resolved_refund", orderId: "cord_resolved" }));

  const result = await deps.scheduler.runOnce();

  assert.equal(result.slaBreachesDisputed, 1);
  assert.equal(deps.disputeEvents.length, 1);
});

test("start schedules and runs maintenance; stop clears timer", async () => {
  const deps = createDeps();
  const mutableGlobal = globalThis as Mutable<typeof globalThis>;
  const originalSetInterval = mutableGlobal.setInterval;
  const originalClearInterval = mutableGlobal.clearInterval;

  let intervalCallback: (() => void) | undefined;
  let cleared: unknown = null;
  const fakeTimer = { id: "timer" } as unknown as ReturnType<typeof setInterval>;

  mutableGlobal.setInterval = ((cb: () => void) => {
    intervalCallback = cb;
    return fakeTimer;
  }) as typeof setInterval;

  mutableGlobal.clearInterval = ((timer: unknown) => {
    cleared = timer;
  }) as typeof clearInterval;

  try {
    deps.scheduler.start(5000);
    if (!intervalCallback) {
      throw new Error("expected scheduler callback to be registered");
    }
    intervalCallback();
    await Promise.resolve();
    deps.scheduler.stop();
  } finally {
    mutableGlobal.setInterval = originalSetInterval;
    mutableGlobal.clearInterval = originalClearInterval;
  }

  assert.equal(cleared, fakeTimer);
});
