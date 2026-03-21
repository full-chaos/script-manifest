import { expect, test } from "@playwright/test";

test("privacy page renders static privacy content", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/privacy");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.locator("h1, h2").first()).toBeVisible();

});
