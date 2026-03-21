import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";
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
  await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Account" }).click();
  await page.getByLabel("Confirm your password").fill("StrongPass1!");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Account Deleted" })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("settings-account-deleted.png");
});
