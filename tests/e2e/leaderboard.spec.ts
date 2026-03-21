import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";

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
  await expect(page.getByRole("heading", { name: "Writer Spotlight" })).toBeVisible();
  await expect(page.getByText("writer_e2e_top")).toBeVisible();
  await expect(page.getByText("#1")).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("leaderboard-ranked.png");
});
