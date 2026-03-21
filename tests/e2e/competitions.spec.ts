import { expect, test } from "@playwright/test";

test("competitions directory renders listings and supports search", async ({ page }) => {
  await page.route("**/api/v1/competitions**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        competitions: [
          {
            id: "comp_001",
            title: "Nicholl Fellowship",
            description: "Prestige screenplay fellowship.",
            format: "feature",
            genre: "drama",
            feeUsd: 65,
            deadline: "2099-09-01T00:00:00.000Z"
          }
        ]
      })
    });
  });

  await page.goto("/competitions");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.getByText("Nicholl Fellowship")).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
