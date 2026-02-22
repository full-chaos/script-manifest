import { expect, test } from "@playwright/test";
import { mockProfileAndProjectEndpoints } from "./support/apiMocks";
import { seedSession } from "./support/session";
import { expectNoSeriousA11yViolations } from "./support/a11y";

test("authenticated profile and projects journey is interactive and accessible", async ({ page }) => {
  await seedSession(page);
  await mockProfileAndProjectEndpoints(page);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: /Your public writer resume/i })
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("E2E Writer");
  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("profile-authenticated.png");

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: /Your script workspace/i })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const openCreateProject = page.getByRole("button", { name: "Create project" }).first();
  await openCreateProject.scrollIntoViewIfNeeded();
  await openCreateProject.click();
  const dialog = page.getByRole("dialog", { name: "Create project" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
