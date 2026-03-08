import type { FastifyBaseLogger } from "fastify";
import type { PaymentGateway } from "./paymentGateway.js";
import type { CoverageMarketplaceRepository } from "./repository.js";
import { getInitialRetryAt, getNextRetryAt } from "./paymentRetry.js";

export interface SchedulerDeps {
  repository: CoverageMarketplaceRepository;
  paymentGateway: PaymentGateway;
  autoCompleteDays: number;
  systemUserId: string;
  logger: FastifyBaseLogger;
}

export function createScheduler(deps: SchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;

  async function runOnce(): Promise<{ autoCompleted: number; slaBreachesDisputed: number }> {
    const now = Date.now();
    const autoCompleteCutoff = now - deps.autoCompleteDays * 86400000;
    const deliveredOrders = await deps.repository.listOrders({ status: "delivered", limit: 1000, offset: 0 });
    let autoCompleted = 0;

    for (const order of deliveredOrders) {
      const deliveredAt = order.deliveredAt ? new Date(order.deliveredAt).getTime() : null;
      if (!deliveredAt || deliveredAt > autoCompleteCutoff) {
        continue;
      }
      const provider = await deps.repository.getProvider(order.providerId);
      if (!provider?.stripeAccountId) {
        continue;
      }
      if (order.stripePaymentIntentId) {
        await deps.paymentGateway.capturePayment(order.stripePaymentIntentId, `idem_capture_${order.id}`);
      }
      try {
        const { transferId } = await deps.paymentGateway.transferToProvider({
          amountCents: order.providerPayoutCents,
          stripeAccountId: provider.stripeAccountId,
          transferGroup: order.id,
          idempotencyKey: `idem_transfer_${order.id}`,
        });
        await deps.repository.updateOrderStatus(order.id, "completed", { stripeTransferId: transferId });
        autoCompleted += 1;
      } catch (error) {
        await deps.repository.createRetryQueueEntry(order.id, getInitialRetryAt());
        deps.logger.warn({ error, orderId: order.id }, "auto-complete transfer failed; queued for retry");
      }
    }

    const claimed = await deps.repository.listOrders({ status: "claimed", limit: 1000, offset: 0 });
    const inProgress = await deps.repository.listOrders({ status: "in_progress", limit: 1000, offset: 0 });
    let slaBreachesDisputed = 0;
    for (const order of [...claimed, ...inProgress]) {
      const deadline = order.slaDeadline ? new Date(order.slaDeadline).getTime() : null;
      if (!deadline || deadline >= now) {
        continue;
      }
      const existingDispute = await deps.repository.getDisputeByOrder(order.id);
      if (existingDispute && (existingDispute.status === "open" || existingDispute.status === "under_review")) {
        continue;
      }

      const dispute = await deps.repository.createDispute(order.id, deps.systemUserId, {
        reason: "non_delivery",
        description: "Auto-opened after SLA deadline elapsed.",
      });
      await deps.repository.updateOrderStatus(order.id, "disputed");
      await deps.repository.createDisputeEvent({
        disputeId: dispute.id,
        actorUserId: deps.systemUserId,
        eventType: "sla_breach_auto_open",
        note: "SLA deadline exceeded; dispute opened automatically.",
        fromStatus: null,
        toStatus: "open",
      });
      slaBreachesDisputed += 1;
    }

    return { autoCompleted, slaBreachesDisputed };
  }

  async function runRetryQueueOnce(): Promise<void> {
    const retries = await deps.repository.getPendingRetries();
    for (const retry of retries) {
      await deps.repository.updateRetryStatus(retry.id, "processing");
      const order = await deps.repository.getOrder(retry.orderId);
      if (!order) {
        await deps.repository.updateRetryStatus(retry.id, "abandoned");
        deps.logger.warn({ retryId: retry.id }, "payment retry abandoned because order was not found");
        continue;
      }
      const provider = await deps.repository.getProvider(order.providerId);
      if (!provider?.stripeAccountId) {
        await deps.repository.updateRetryStatus(retry.id, "abandoned");
        deps.logger.warn({ retryId: retry.id, orderId: order.id }, "payment retry abandoned because provider Stripe account was missing");
        continue;
      }

      try {
        const { transferId } = await deps.paymentGateway.transferToProvider({
          amountCents: order.providerPayoutCents,
          stripeAccountId: provider.stripeAccountId,
          transferGroup: order.id,
          idempotencyKey: `idem_transfer_retry_${order.id}_${retry.attemptNumber}`,
        });
        await deps.repository.updateOrderStatus(order.id, "completed", { stripeTransferId: transferId });
        await deps.repository.updateRetryStatus(retry.id, "succeeded");
      } catch (error) {
        const nextRetryAt = getNextRetryAt(retry.attemptNumber);
        if (!nextRetryAt) {
          await deps.repository.updateRetryStatus(retry.id, "abandoned");
          await deps.repository.updateOrderStatus(order.id, "abandoned");
          deps.logger.warn({ error, retryId: retry.id, orderId: order.id }, "payment retry abandoned after maximum attempts");
          continue;
        }
        await deps.repository.updateRetryStatus(retry.id, "pending", nextRetryAt);
        deps.logger.warn({ error, retryId: retry.id, orderId: order.id, nextRetryAt }, "payment retry failed; scheduled next attempt");
      }
    }
  }

  function start(intervalMs: number): void {
    if (intervalMs <= 0) {
      return;
    }
    timer = setInterval(() => {
      void runOnce().catch((error) => {
        deps.logger.error({ error }, "sla maintenance run failed");
      });
    }, intervalMs);

    retryTimer = setInterval(() => {
      void runRetryQueueOnce().catch((error) => {
        deps.logger.error({ error }, "payment retry queue poll failed");
      });
    }, 30_000);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  return { start, stop, runOnce, runRetryQueueOnce };
}
