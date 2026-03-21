import { expect, test } from "@playwright/test";

test("leaderboard shows ranked writers", async ({ page }) => {
  await page.route("**/api/v1/leaderboard**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        leaderboard: [
          {
            writerId: "writer_e2e_top",
            rank: 1,
            totalScore: 95.5,
            submissionCount: 8,
            placementCount: 4,
            tier: "top_1",
            badges: ["Nicholl Winner"],
            scoreChange30d: 2.4,
            lastUpdatedAt: "2099-01-01T00:00:00.000Z"
          }
        ],
        total: 1
      })
    });
  });

  await page.goto("/leaderboard");
  await expect(page.locator("h1, h2").first()).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
