import { expect, test } from "@playwright/test";
import { mockProfileAndProjectEndpoints } from "./support/apiMocks";
import { seedSession } from "./support/session";

test("authenticated profile and projects journey is interactive and accessible", async ({ page }) => {
  await seedSession(page);
  await mockProfileAndProjectEndpoints(page);

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: /Your public writer resume/i })
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("E2E Writer");
  await expect(page).toHaveScreenshot("profile-authenticated.png", { fullPage: true });

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: /Your script workspace/i })).toBeVisible();

  const openCreateProject = page.getByRole("button", { name: "Create project" }).first();
  await openCreateProject.scrollIntoViewIfNeeded();
  await openCreateProject.click();
  const dialog = page.getByRole("dialog", { name: "Create project" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
