import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";

test("privacy page renders static privacy content", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data We Collect" })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("privacy-static-content.png");
});
