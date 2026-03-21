import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, makeUnique, registerUser } from "./helpers.js";

const ADMIN_USER_ID = "admin_01";
const ADMIN_EMAIL = "admin_01_harness@example.com";
const ADMIN_PASSWORD = "AdminPass1!";

const db = getPool(process.env.INTEGRATION_DATABASE_URL ?? "postgresql://manifest:manifest@localhost:5432/manifest");

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}

async function ensureAdminUser(): Promise<string> {
  const salt = "harness_admin_salt_01";
  const hash = hashPassword(ADMIN_PASSWORD, salt);
  await db.query(
    `INSERT INTO app_users (id, email, password_hash, password_salt, display_name, role, created_at, terms_accepted_at)
     VALUES ($1,$2,$3,$4,'Integration Admin','admin',NOW(),NOW())
     ON CONFLICT (id)
     DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
                   password_salt = EXCLUDED.password_salt, role = EXCLUDED.role`,
    [ADMIN_USER_ID, ADMIN_EMAIL, hash, salt]
  );

  const login = await expectOkJson<{ token: string }>(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  }, 200);
  return login.token;
}

async function getOrderStatus(orderId: string, token: string): Promise<string> {
  const order = await expectOkJson<{ order: { status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: authHeaders(token)
    },
    200
  );
  return order.order.status;
}

test("compose flow: coverage dispute opened and resolved with refund", async () => {
  const adminToken = await ensureAdminUser();
  const writer = await registerUser("coverage-dispute-writer");
  const providerUser = await registerUser("coverage-dispute-provider");

  const provider = await expectOkJson<{ provider: { id: string; stripeAccountId: string | null } }>(
    `${API_BASE_URL}/api/v1/coverage/providers`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        displayName: "Coverage Dispute Provider",
        bio: "Provider used by dispute integration flow.",
        specialties: ["feature"]
      })
    },
    201
  );
  assert.ok(provider.provider.id.length > 0);
  assert.ok(provider.provider.stripeAccountId);

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
            id: provider.provider.stripeAccountId,
            charges_enabled: true,
            payouts_enabled: true
          }
        }
      })
    },
    200
  );

  const service = await expectOkJson<{ service: { id: string } }>(
    `${API_BASE_URL}/api/v1/coverage/providers/${encodeURIComponent(provider.provider.id)}/services`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        title: "Coverage Dispute Service",
        description: "Used by integration dispute flow.",
        tier: "early_draft",
        priceCents: 15000,
        currency: "usd",
        turnaroundDays: 5,
        maxPages: 120
      })
    },
    201
  );

  const createdOrder = await expectOkJson<{ order: { id: string; status: string; stripePaymentIntentId: string | null } }>(
    `${API_BASE_URL}/api/v1/coverage/orders`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(writer.token)
      },
      body: JSON.stringify({
        serviceId: service.service.id,
        scriptId: makeUnique("coverage_dispute_script"),
        projectId: makeUnique("coverage_dispute_project")
      })
    },
    201
  );
  const orderId = createdOrder.order.id;
  assert.equal(createdOrder.order.status, "placed");
  assert.ok(createdOrder.order.stripePaymentIntentId);

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
          object: { id: createdOrder.order.stripePaymentIntentId }
        }
      })
    },
    200
  );

  const paymentHeldStatus = await getOrderStatus(orderId, writer.token);
  assert.equal(paymentHeldStatus, "payment_held");

  const claimed = await expectOkJson<{ order: { status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/claim`,
    {
      method: "POST",
      headers: authHeaders(providerUser.token)
    },
    200
  );
  assert.equal(claimed.order.status, "claimed");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/deliver`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(providerUser.token)
      },
      body: JSON.stringify({
        summary: "Delivered coverage notes.",
        strengths: "Strong opening premise.",
        weaknesses: "Second act pacing drifts.",
        recommendations: "Sharpen midpoint turn and stakes.",
        score: 70
      })
    },
    200
  );

  const deliveredStatus = await getOrderStatus(orderId, writer.token);
  assert.equal(deliveredStatus, "delivered");

  const dispute = await expectOkJson<{ dispute: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/orders/${encodeURIComponent(orderId)}/dispute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(writer.token)
      },
      body: JSON.stringify({
        reason: "quality",
        description: "Coverage quality does not match service expectations."
      })
    },
    201
  );
  assert.equal(dispute.dispute.status, "open");

  const disputedStatus = await getOrderStatus(orderId, writer.token);
  assert.equal(disputedStatus, "disputed");

  const resolved = await expectOkJson<{ dispute: { status: string } }>(
    `${API_BASE_URL}/api/v1/coverage/disputes/${encodeURIComponent(dispute.dispute.id)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(adminToken)
      },
      body: JSON.stringify({
        status: "resolved_refund",
        adminNotes: "Refund approved after dispute review.",
        refundAmountCents: 15000
      })
    },
    200
  );
  assert.equal(resolved.dispute.status, "resolved_refund");

  const refundedStatus = await getOrderStatus(orderId, writer.token);
  assert.equal(refundedStatus, "refunded");
});
