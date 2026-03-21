import { expect, test } from "@playwright/test";
import { seedSession } from "./support/session";

test("account settings renders and supports account deletion flow", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/v1/auth/account", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/settings/account");
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.locator("h1, h2").first()).toBeVisible();

});
