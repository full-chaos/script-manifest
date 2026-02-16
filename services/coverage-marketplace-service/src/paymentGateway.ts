export interface PaymentGateway {
  createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }>;
  createAccountLink(accountId: string): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<{ intentId: string; clientSecret: string }>;
  capturePayment(intentId: string): Promise<void>;
  transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }>;
  refund(intentId: string, amountCents?: number): Promise<{ refundId: string }>;
  constructWebhookEvent(payload: string, signature: string): unknown;
}

export class MemoryPaymentGateway implements PaymentGateway {
  public accounts = new Map<string, { chargesEnabled: boolean; payoutsEnabled: boolean }>();
  public intents = new Map<string, { amountCents: number; captured: boolean }>();
  public transfers: Array<{ transferId: string; amountCents: number; stripeAccountId: string }> = [];
  public refunds: Array<{ intentId: string; amountCents?: number }> = [];
  private nextId = 1;

  private id(prefix: string) {
    return `${prefix}_${String(this.nextId++)}`;
  }

  async createConnectAccount(_email: string): Promise<{ accountId: string; onboardingUrl: string }> {
    const accountId = this.id("acct");
    this.accounts.set(accountId, { chargesEnabled: false, payoutsEnabled: false });
    return { accountId, onboardingUrl: `https://connect.stripe.com/setup/${accountId}` };
  }

  async createAccountLink(accountId: string): Promise<{ url: string }> {
    return { url: `https://connect.stripe.com/setup/${accountId}` };
  }

  async getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
    return this.accounts.get(accountId) ?? { chargesEnabled: false, payoutsEnabled: false };
  }

  completeOnboarding(accountId: string): void {
    this.accounts.set(accountId, { chargesEnabled: true, payoutsEnabled: true });
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intentId = this.id("pi");
    this.intents.set(intentId, { amountCents: params.amountCents, captured: false });
    return { intentId, clientSecret: `${intentId}_secret` };
  }

  async capturePayment(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) intent.captured = true;
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }> {
    const transferId = this.id("tr");
    this.transfers.push({ transferId, amountCents: params.amountCents, stripeAccountId: params.stripeAccountId });
    return { transferId };
  }

  async refund(intentId: string, amountCents?: number): Promise<{ refundId: string }> {
    this.refunds.push({ intentId, amountCents });
    return { refundId: this.id("re") };
  }

  constructWebhookEvent(payload: string, _signature: string): unknown {
    return JSON.parse(payload);
  }
}
