import { expect, test } from "@playwright/test";
import { seedSession } from "./support/session";

test("admin dashboard loads with admin session", async ({ page }) => {
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

  await page.goto("/admin");
  await expect(page.locator("h1, h2, h3").first()).toBeVisible();
});
