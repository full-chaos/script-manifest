import { expect, test } from "@playwright/test";

test("admin dashboard loads with admin session", async ({ page }) => {
  await page.route("**/api/v1/auth/me", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "admin_e2e_01",
          email: "admin.e2e@example.com",
          displayName: "E2E Admin",
          role: "admin",
          emailVerified: true
        },
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    })
  );

  await page.goto("/admin");
  await expect(page.locator("h1, h2, h3").first()).toBeVisible();
});
