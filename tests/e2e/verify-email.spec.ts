import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";
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
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText("Verification code sent to your email.")).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("verify-email-resend.png");
});
