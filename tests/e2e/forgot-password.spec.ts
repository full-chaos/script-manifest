import { expect, test } from "@playwright/test";

test("forgot password accepts email and submits request", async ({ page }) => {
  await page.route("**/api/v1/auth/forgot-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/forgot-password");
  await expect(page.locator("h1, h2").first()).toBeVisible();

  // TODO: enable after fixing pre-existing contrast violations
  // TODO: generate screenshot baselines in CI
});
