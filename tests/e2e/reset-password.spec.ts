import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";

test("reset password flow accepts token and submits new password", async ({ page }) => {
  await page.route("**/api/v1/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/reset-password?token=test_token_123");
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await page.getByLabel("New password").fill("StrongPass1!");
  await page.getByLabel("Confirm password").fill("StrongPass1!");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Password reset successfully!")).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("reset-password-success.png");
});
