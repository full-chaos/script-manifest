import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";
import { seedSession, TEST_USER } from "./support/session";

test("feedback exchange loads listings and authenticated controls", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (path === "/api/v1/feedback/tokens/balance" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ balance: 3 })
      });
      return;
    }

    if (path === "/api/v1/feedback/tokens/grant-signup" && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (path === "/api/v1/feedback/listings" && method === "GET") {
      const status = url.searchParams.get("status");
      const ownerUserId = url.searchParams.get("ownerUserId");
      if (status === "open") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            listings: [
              {
                id: "listing_open_01",
                ownerUserId: "writer_other",
                projectId: "project_other",
                scriptId: "script_other",
                title: "The Last Rewrite",
                description: "Need notes on pacing and act break.",
                genre: "thriller",
                format: "feature",
                pageCount: 105,
                status: "open",
                expiresAt: "2099-04-01T00:00:00.000Z",
                reviewDeadline: null,
                claimedByUserId: null,
                createdAt: "2099-02-01T00:00:00.000Z",
                updatedAt: "2099-02-01T00:00:00.000Z"
              }
            ]
          })
        });
        return;
      }

      if (ownerUserId === TEST_USER.id) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ listings: [] })
        });
        return;
      }
    }

    if (path === "/api/v1/projects" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            {
              id: "project_feedback_01",
              ownerUserId: TEST_USER.id,
              title: "Feedback Project",
              logline: "A writer tests feedback flow.",
              synopsis: "Testing project payload.",
              format: "feature",
              genre: "drama",
              pageCount: 100,
              isDiscoverable: true,
              createdAt: "2099-01-01T00:00:00.000Z",
              updatedAt: "2099-01-01T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    if (path === "/api/v1/feedback/reviews" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reviews: [] })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/feedback");
  await expect(page.getByRole("heading", { name: "Give feedback, get feedback" })).toBeVisible();
  await expect(page.getByText("The Last Rewrite")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request feedback on a script" })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("feedback-listings-authenticated.png");
});
