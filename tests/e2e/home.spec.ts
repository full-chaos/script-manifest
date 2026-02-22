import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";
import { clearSession } from "./support/session";

test("logged-out home page renders with stable hero UX", async ({ page }) => {
  await clearSession(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Build your screenwriting portfolio without losing your history again/i
    })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse competitions" })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("home-logged-out.png", { fullPage: true });
});
