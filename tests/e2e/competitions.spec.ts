import { expect, test } from "@playwright/test";

test("competitions directory loads without error", async ({ page }) => {
  await page.goto("/competitions");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});
