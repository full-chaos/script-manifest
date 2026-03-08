export interface PaymentGateway {
  createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }>;
  createAccountLink(accountId: string): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<{ intentId: string; clientSecret: string }>;
  capturePayment(intentId: string, idempotencyKey?: string): Promise<void>;
  transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
    idempotencyKey?: string;
  }): Promise<{ transferId: string }>;
  refund(intentId: string, amountCents?: number, idempotencyKey?: string): Promise<{ refundId: string }>;
  constructWebhookEvent(payload: string, signature: string): unknown;
  // New Stripe Customer & Payment Method related methods
  createCustomer(params: { email: string; name: string; metadata?: Record<string, string> }): Promise<{ customerId: string }>;
  listPaymentMethods(customerId: string): Promise<Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
  createPaymentIntentWithCustomer(params: {
    amountCents: number;
    currency: string;
    customerId: string;
    paymentMethodId?: string;
    setupFutureUsage?: 'on_session' | 'off_session';
    metadata?: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<{ intentId: string; clientSecret: string }>;
  getReceiptUrl(paymentIntentId: string): Promise<string | null>;
}

export class MemoryPaymentGateway implements PaymentGateway {
  public accounts = new Map<string, { chargesEnabled: boolean; payoutsEnabled: boolean }>();
  public intents = new Map<string, { amountCents: number; captured: boolean; customerId?: string; paymentMethodId?: string; metadata?: Record<string, string>; setupFutureUsage?: string }>();
  public transfers: Array<{ transferId: string; amountCents: number; stripeAccountId: string }> = [];
  public refunds: Array<{ intentId: string; amountCents?: number }> = [];
  // In-memory entities
  public customers = new Map<string, { email: string; name: string; metadata?: Record<string, string> }>();
  public paymentMethods = new Map<string, Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>>();
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
    idempotencyKey?: string;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intentId = this.id("pi");
    this.intents.set(intentId, { amountCents: params.amountCents, captured: false });
    return { intentId, clientSecret: `${intentId}_secret` };
  }

  async capturePayment(intentId: string, _idempotencyKey?: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) intent.captured = true;
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
    idempotencyKey?: string;
  }): Promise<{ transferId: string }> {
    const transferId = this.id("tr");
    this.transfers.push({ transferId, amountCents: params.amountCents, stripeAccountId: params.stripeAccountId });
    return { transferId };
  }

  async refund(intentId: string, amountCents?: number, _idempotencyKey?: string): Promise<{ refundId: string }> {
    this.refunds.push({ intentId, amountCents });
    return { refundId: this.id("re") };
  }

  constructWebhookEvent(payload: string, _signature: string): unknown {
    return JSON.parse(payload);
  }

  // New Stripe Customer & Payment Method related implementations (Memory)
  async createCustomer(params: { email: string; name: string; metadata?: Record<string, string> }): Promise<{ customerId: string }> {
    const customerId = this.id("cus");
    this.customers.set(customerId, { email: params.email, name: params.name, metadata: params.metadata });
    this.paymentMethods.set(customerId, []);
    return { customerId };
  }

  async listPaymentMethods(customerId: string): Promise<Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>> {
    const methods = this.paymentMethods.get(customerId) ?? [];
    return methods.map((m) => ({ id: m.id, brand: m.brand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear }));
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    for (const [customerId, methods] of this.paymentMethods.entries()) {
      const idx = methods.findIndex((m) => m.id === paymentMethodId);
      if (idx >= 0) {
        methods.splice(idx, 1);
        this.paymentMethods.set(customerId, methods);
        return;
      }
    }
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
    const intentId = this.id("pi");
    this.intents.set(intentId, {
      amountCents: params.amountCents,
      captured: false,
      customerId: params.customerId,
      paymentMethodId: params.paymentMethodId,
      metadata: params.metadata,
      setupFutureUsage: params.setupFutureUsage,
    } as any);
    return { intentId, clientSecret: `${intentId}_secret` };
  }

  async getReceiptUrl(paymentIntentId: string): Promise<string | null> {
    return `https://receipt.stripe.com/test_${paymentIntentId}`;
  }

  // Getter for tests to inspect in-memory customers
  getCustomers(): Array<{ id: string; email: string; name: string; metadata?: Record<string, string> }> {
    return Array.from(this.customers.entries()).map(([id, data]) => ({ id, email: data.email, name: data.name, metadata: data.metadata }));
  }
}
