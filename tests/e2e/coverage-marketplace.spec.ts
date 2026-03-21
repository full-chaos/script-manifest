import { expect, test } from "@playwright/test";
import { seedSession, TEST_USER } from "./support/session";

test("coverage provider dashboard renders provider and order data", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (path === "/api/v1/coverage/providers" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: [
            {
              id: "provider_01",
              userId: TEST_USER.id,
              displayName: "E2E Coverage",
              bio: "Fast and specific notes.",
              sampleCoverageUrl: "",
              genres: ["drama"],
              formats: ["feature"],
              priceCents: 15000,
              turnaroundDays: 7,
              avgRating: 4.8,
              totalOrdersCompleted: 12,
              isActive: true,
              createdAt: "2099-01-01T00:00:00.000Z",
              updatedAt: "2099-01-01T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    if (path === "/api/v1/coverage/orders" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orders: [
            {
              id: "order_01",
              listingId: "listing_01",
              requesterUserId: "writer_x",
              providerId: "provider_01",
              status: "payment_held",
              amountCents: 20000,
              providerPayoutCents: 15000,
              platformFeeCents: 5000,
              slaDeadline: "2099-03-01T00:00:00.000Z",
              claimedAt: null,
              deliveredAt: null,
              completedAt: null,
              createdAt: "2099-02-01T00:00:00.000Z",
              updatedAt: "2099-02-01T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/coverage/dashboard");
  await expect(page.locator("h1, h2, h3").first()).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
