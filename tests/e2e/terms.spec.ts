import { expect, test } from "@playwright/test";

test("terms page renders static legal content", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/terms");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.locator("h1, h2").first()).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
