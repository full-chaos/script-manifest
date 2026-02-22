import { expect, test } from "@playwright/test";
import { mockAuthEndpoints } from "./support/apiMocks";
import { expectNoSeriousA11yViolations } from "./support/a11y";

test("sign-in page supports register and sign-out journey", async ({ page }) => {
  await mockAuthEndpoints(page);

  await page.goto("/signin");
  await page.getByRole("button", { name: "Create account" }).first().click();

  await page.getByLabel("Display name").fill("E2E Writer");
  await page.getByLabel("Email").fill("e2e.writer@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.locator("form").getByRole("button", { name: "Create account" }).nth(1).click();

  await expect(page.getByText(/Signed in as/i)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("signin-authenticated.png", { fullPage: true });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Signed out.")).toBeVisible();
});
