import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./support/a11y";

test("admin dashboard renders with admin session and metrics", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_admin_e2e",
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: {
          id: "admin_e2e_01",
          email: "admin.e2e@example.com",
          displayName: "E2E Admin",
          role: "admin",
          emailVerified: true
        }
      })
    );
    window.dispatchEvent(new CustomEvent("script_manifest_session_changed"));
  });

  await page.route("**/api/v1/admin/metrics", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        metrics: {
          totalUsers: 120,
          activeUsers30d: 45,
          totalProjects: 350,
          openDisputes: 2,
          pendingAppeals: 1,
          pendingFlags: 3,
          pendingReports: 4
        }
      })
    });
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "User Management" })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("admin-dashboard-metrics.png");
});
