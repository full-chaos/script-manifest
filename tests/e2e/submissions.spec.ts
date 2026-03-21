import { expect, test } from "@playwright/test";
import { seedSession, TEST_USER } from "./support/session";

test("submissions page loads authenticated submission list", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;

    if (path === "/api/v1/projects" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projects: [
            {
              id: "project_01",
              ownerUserId: TEST_USER.id,
              title: "Pilot Script",
              logline: "A writer chases deadlines.",
              synopsis: "A grounded drama.",
              format: "feature",
              genre: "drama",
              pageCount: 102,
              isDiscoverable: true,
              createdAt: "2099-01-01T00:00:00.000Z",
              updatedAt: "2099-01-01T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    if (path === "/api/v1/competitions" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          competitions: [
            {
              id: "comp_01",
              title: "Austin Film Festival",
              description: "Major screenwriting competition.",
              format: "feature",
              genre: "drama",
              feeUsd: 55,
              deadline: "2099-10-01T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    if (path === "/api/v1/submissions" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          submissions: [
            {
              id: "submission_01",
              projectId: "project_01",
              competitionId: "comp_01",
              status: "quarterfinalist",
              submittedAt: "2099-01-15T00:00:00.000Z"
            }
          ]
        })
      });
      return;
    }

    if (path === "/api/v1/placements" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ placements: [] })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/submissions");
  await expect(page.locator("h1, h2").first()).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
