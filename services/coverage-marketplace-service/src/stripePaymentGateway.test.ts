import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { StripePaymentGateway } from "./stripePaymentGateway.js";

function createGatewayWithMocks() {
  const gateway = new StripePaymentGateway("sk_test_fake", "whsec_fake");

  const mockStripe = {
    accounts: {
      create: mock.fn(async () => ({ id: "acct_1" })),
      retrieve: mock.fn(async () => ({ charges_enabled: true, payouts_enabled: true })),
    },
    accountLinks: {
      create: mock.fn(async () => ({ url: "https://connect.stripe.com/setup/acct_1" })),
    },
    paymentIntents: {
      create: mock.fn(async () => ({ id: "pi_1", client_secret: "pi_1_secret" })),
      capture: mock.fn(async () => ({})),
      retrieve: mock.fn(async () => ({ latest_charge: { receipt_url: "https://receipt.stripe.com/r1" } })),
    },
    transfers: {
      create: mock.fn(async () => ({ id: "tr_1" })),
    },
    refunds: {
      create: mock.fn(async () => ({ id: "re_1" })),
    },
    customers: {
      create: mock.fn(async () => ({ id: "cus_1" })),
    },
    paymentMethods: {
      list: mock.fn(async () => ({
        data: [{ id: "pm_1", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }],
      })),
      detach: mock.fn(async () => ({})),
    },
    webhooks: {
      constructEvent: mock.fn(() => ({ id: "evt_1", type: "payment_intent.succeeded" })),
    },
  };

  Object.defineProperty(gateway, "stripe", { value: mockStripe, writable: true });

  return { gateway, mockStripe };
}

function getCallArg(mockFn: { mock: { calls: Array<{ arguments: unknown[] }> } }, callIdx: number, argIdx: number): unknown {
  return (mockFn.mock.calls[callIdx]!.arguments as unknown[])[argIdx];
}

test("createConnectAccount creates account and returns onboarding URL", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  const result = await gateway.createConnectAccount("provider@test.com");

  assert.equal(result.accountId, "acct_1");
  assert.equal(result.onboardingUrl, "https://connect.stripe.com/setup/acct_1");
  assert.equal(mockStripe.accounts.create.mock.callCount(), 1);
  assert.equal(mockStripe.accountLinks.create.mock.callCount(), 1);
});

test("createAccountLink returns URL", async () => {
  const { gateway } = createGatewayWithMocks();
  const result = await gateway.createAccountLink("acct_1");
  assert.equal(result.url, "https://connect.stripe.com/setup/acct_1");
});

test("getAccountStatus returns charges and payouts enabled", async () => {
  const { gateway } = createGatewayWithMocks();
  const result = await gateway.getAccountStatus("acct_1");
  assert.deepEqual(result, { chargesEnabled: true, payoutsEnabled: true });
});

test("createPaymentIntent creates intent with manual capture", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  const result = await gateway.createPaymentIntent({
    amountCents: 5000,
    currency: "usd",
    metadata: { orderId: "ord_1" },
    idempotencyKey: "idem_1",
  });

  assert.equal(result.intentId, "pi_1");
  assert.equal(result.clientSecret, "pi_1_secret");
  const arg0 = getCallArg(mockStripe.paymentIntents.create, 0, 0) as Record<string, unknown>;
  assert.equal(arg0.amount, 5000);
  assert.equal(arg0.capture_method, "manual");
});

test("capturePayment captures the payment intent", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  await gateway.capturePayment("pi_1", "idem_cap");
  assert.equal(mockStripe.paymentIntents.capture.mock.callCount(), 1);
});

test("transferToProvider creates a transfer", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  const result = await gateway.transferToProvider({
    amountCents: 4000,
    stripeAccountId: "acct_1",
    transferGroup: "ord_1",
    idempotencyKey: "idem_tr",
  });

  assert.equal(result.transferId, "tr_1");
  assert.equal(mockStripe.transfers.create.mock.callCount(), 1);
});

test("refund creates a refund for full amount", async () => {
  const { gateway } = createGatewayWithMocks();
  const result = await gateway.refund("pi_1");
  assert.equal(result.refundId, "re_1");
});

test("refund creates a partial refund with amount", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  await gateway.refund("pi_1", 2000, "idem_ref");
  const arg0 = getCallArg(mockStripe.refunds.create, 0, 0) as Record<string, unknown>;
  assert.equal(arg0.amount, 2000);
});

test("constructWebhookEvent delegates to stripe webhooks", () => {
  const { gateway } = createGatewayWithMocks();
  const event = gateway.constructWebhookEvent("payload", "sig_header");
  assert.equal((event as unknown as Record<string, unknown>).type, "payment_intent.succeeded");
});

test("createCustomer creates a Stripe customer", async () => {
  const { gateway } = createGatewayWithMocks();
  const result = await gateway.createCustomer({ email: "user@test.com", name: "Test User" });
  assert.equal(result.customerId, "cus_1");
});

test("listPaymentMethods returns mapped card data", async () => {
  const { gateway } = createGatewayWithMocks();
  const methods = await gateway.listPaymentMethods("cus_1");
  assert.equal(methods.length, 1);
  assert.equal(methods[0]!.brand, "visa");
  assert.equal(methods[0]!.last4, "4242");
});

test("detachPaymentMethod detaches the method", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  await gateway.detachPaymentMethod("pm_1");
  assert.equal(mockStripe.paymentMethods.detach.mock.callCount(), 1);
});

test("getReceiptUrl returns receipt URL from latest charge", async () => {
  const { gateway } = createGatewayWithMocks();
  const url = await gateway.getReceiptUrl("pi_1");
  assert.equal(url, "https://receipt.stripe.com/r1");
});

test("getReceiptUrl returns null when no receipt", async () => {
  const { gateway, mockStripe } = createGatewayWithMocks();
  mockStripe.paymentIntents.retrieve.mock.mockImplementation(
    async () => ({ latest_charge: null }) as unknown as Awaited<ReturnType<typeof mockStripe.paymentIntents.retrieve>>,
  );
  const url = await gateway.getReceiptUrl("pi_1");
  assert.strictEqual(url, null);
});
