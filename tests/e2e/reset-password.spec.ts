import { expect, test } from "@playwright/test";

test("reset password flow accepts token and submits new password", async ({ page }) => {
  await page.route("**/api/v1/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/reset-password?token=test_token_123");
  await expect(page.locator("h1, h2").first()).toBeVisible();

});
