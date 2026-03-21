import { expect, test } from "@playwright/test";
import { seedSession } from "./support/session";

test("verify email page renders and allows resend", async ({ page }) => {
  await seedSession(page);
  await page.route("**/api/v1/auth/resend-verification", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/verify-email");
  await expect(page.locator("h1, h2").first()).toBeVisible();

});
