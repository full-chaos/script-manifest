import Stripe from "stripe";
import type { PaymentGateway } from "./paymentGateway.js";

export class StripePaymentGateway implements PaymentGateway {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }> {
    const account = await this.stripe.accounts.create({
      type: "express",
      email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
    });
    const link = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?refresh=1`,
      return_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?success=1`,
      type: "account_onboarding"
    });
    return { accountId: account.id, onboardingUrl: link.url };
  }

  async createAccountLink(accountId: string): Promise<{ url: string }> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?refresh=1`,
      return_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?success=1`,
      type: "account_onboarding"
    });
    return { url: link.url };
  }

  async getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false
    };
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        capture_method: "manual",
        metadata: params.metadata ?? {}
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );
    return { intentId: intent.id, clientSecret: intent.client_secret! };
  }

  async capturePayment(intentId: string, idempotencyKey?: string): Promise<void> {
    await this.stripe.paymentIntents.capture(
      intentId,
      undefined,
      idempotencyKey ? { idempotencyKey } : undefined
    );
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
    idempotencyKey?: string;
  }): Promise<{ transferId: string }> {
    const transfer = await this.stripe.transfers.create(
      {
        amount: params.amountCents,
        currency: "usd",
        destination: params.stripeAccountId,
        transfer_group: params.transferGroup
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );
    return { transferId: transfer.id };
  }

  async refund(intentId: string, amountCents?: number, idempotencyKey?: string): Promise<{ refundId: string }> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: intentId,
        ...(amountCents != null ? { amount: amountCents } : {})
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );
    return { refundId: refund.id };
  }

  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  async createCustomer(params: { email: string; name: string; metadata?: Record<string, string> }): Promise<{ customerId: string }> {
    const customer = await this.stripe.customers.create({ email: params.email, name: params.name, metadata: params.metadata ?? {} });
    return { customerId: customer.id };
  }

  async listPaymentMethods(customerId: string): Promise<Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>> {
    const res = await this.stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    return (res.data ?? []).map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? '',
      last4: pm.card?.last4 ?? '',
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
    }));
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async createPaymentIntentWithCustomer(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId?: string;
    setupFutureUsage?: 'on_session' | 'off_session';
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        setup_future_usage: params.setupFutureUsage,
        metadata: params.metadata ?? {},
        capture_method: 'manual',
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );
    return { intentId: intent.id, clientSecret: intent.client_secret! };
  }

  async getReceiptUrl(paymentIntentId: string): Promise<string | null> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const latest = (intent as any).latest_charge as Stripe.Charge | undefined;
    return latest?.receipt_url ?? null;
  }
}
