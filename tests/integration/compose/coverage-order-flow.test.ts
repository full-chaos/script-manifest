import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE_URL,
  authHeaders,
  expectOkJson,
  makeUnique,
  registerUser
} from "./helpers.js";

test("compose flow: coverage provider/service/order lifecycle", async () => {
  const writer = await registerUser("coverage-writer");
  const providerUser = await registerUser("coverage-provider");

  const providerResponse = await expectOkJson<{
    provider: {
      id: string;
      stripeAccountId: string | null;
      status: string;
    };
  }>(
    `${API_BASE_URL}/api/v1/coverage/providers`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        displayName: "Integration Coverage Provider",
        bio: "Provider for compose integration tests.",
        specialties: ["feature", "drama"]
      })
    },
    201
  );
  const providerId = providerResponse.provider.id;
  const stripeAccountId = providerResponse.provider.stripeAccountId;
  assert.ok(providerId.length > 0);
  assert.ok(stripeAccountId, "expected stripe account to be attached");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/coverage/stripe-webhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "integration-signature"
      },
      body: JSON.stringify({
        type: "account.updated",
        data: {
          object: {
            id: stripeAccountId,
            charges_enabled: true,
            payouts_enabled: true
          }
        }
      })
    },
    200
  );

  const serviceResponse = await expectOkJson<{ service: { id: string } }>(
    `${API_BASE_URL}/api/v1/coverage/providers/${encodeURIComponent(providerId)}/services`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        title: "Feature Draft Notes",
        description: "Full integration notes package.",
        tier: "early_draft",
        priceCents: 12000,
        currency: "usd",
        turnaroundDays: 3,
        maxPages: 130
      })
    },
    201
  );
  const serviceId = serviceResponse.service.id;

  const orderResponse = await expectOkJson<{
    order: { id: string; stripePaymentIntentId: string | null; status: string };
  }>(
    `${API_BASE_URL}/api/v1/coverage/orders`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(writer.token)
      },
      body: JSON.stringify({
        serviceId,
        scriptId: makeUnique("script"),
        projectId: makeUnique("project")
      })
    },
    201
  );
  const orderId = orderResponse.order.id;
  const paymentIntentId = orderResponse.order.stripePaymentIntentId;
  assert.ok(paymentIntentId, "expected payment intent");
  assert.equal(orderResponse.order.status, "placed");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/coverage/stripe-webhook`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "integration-signature"
      },
      body: JSON.stringify({
        type: "payment_intent.amount_capturable_updated",
        data: {
          object: { id: paymentIntentId }
        }
      })
    },
    200
  );

  const claimedOrder = await expectOkJson<{ order: { status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/claim`,
    {
      method: "POST",
      headers: authHeaders(providerUser.token)
    },
    200
  );
  assert.equal(claimedOrder.order.status, "claimed");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/deliver`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        summary: "Strong central premise and voice.",
        strengths: "Compelling setup and clean scene progression.",
        weaknesses: "Act two stakes need sharper escalation.",
        recommendations: "Raise midpoint reversal pressure and trim exposition.",
        score: 82
      })
    },
    200
  );

  const completedOrder = await expectOkJson<{ order: { status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/complete`,
    {
      method: "POST",
      headers: authHeaders(writer.token)
    },
    200
  );
  assert.equal(completedOrder.order.status, "completed");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/review`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(writer.token)
      },
      body: JSON.stringify({
        rating: 5,
        comment: "Clear and actionable notes."
      })
    },
    201
  );

  const providerReviews = await expectOkJson<{ reviews: Array<{ rating: number }> }>(
    `${API_BASE_URL}/api/v1/coverage/providers/${encodeURIComponent(providerId)}/reviews`,
    { method: "GET" },
    200
  );
  assert.ok(providerReviews.reviews.length >= 1);
  assert.equal(providerReviews.reviews[0]?.rating, 5);
});
