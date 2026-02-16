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
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      capture_method: "manual",
      metadata: params.metadata ?? {}
    });
    return { intentId: intent.id, clientSecret: intent.client_secret! };
  }

  async capturePayment(intentId: string): Promise<void> {
    await this.stripe.paymentIntents.capture(intentId);
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }> {
    const transfer = await this.stripe.transfers.create({
      amount: params.amountCents,
      currency: "usd",
      destination: params.stripeAccountId,
      transfer_group: params.transferGroup
    });
    return { transferId: transfer.id };
  }

  async refund(intentId: string, amountCents?: number): Promise<{ refundId: string }> {
    const refund = await this.stripe.refunds.create({
      payment_intent: intentId,
      ...(amountCents != null ? { amount: amountCents } : {})
    });
    return { refundId: refund.id };
  }

  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
