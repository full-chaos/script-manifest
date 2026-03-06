import type { FastifyBaseLogger } from "fastify";
import type { PaymentGateway } from "./paymentGateway.js";
import type { CoverageMarketplaceRepository } from "./repository.js";

export interface SchedulerDeps {
  repository: CoverageMarketplaceRepository;
  paymentGateway: PaymentGateway;
  autoCompleteDays: number;
  systemUserId: string;
  logger: FastifyBaseLogger;
}

export function createScheduler(deps: SchedulerDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;

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
        await deps.paymentGateway.capturePayment(order.stripePaymentIntentId);
      }
      const { transferId } = await deps.paymentGateway.transferToProvider({
        amountCents: order.providerPayoutCents,
        stripeAccountId: provider.stripeAccountId,
        transferGroup: order.id,
      });
      await deps.repository.updateOrderStatus(order.id, "completed", { stripeTransferId: transferId });
      autoCompleted += 1;
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

  function start(intervalMs: number): void {
    if (intervalMs <= 0) {
      return;
    }
    timer = setInterval(() => {
      void runOnce().catch((error) => {
        deps.logger.error({ error }, "sla maintenance run failed");
      });
    }, intervalMs);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, runOnce };
}
