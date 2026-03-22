import type { Page } from "@playwright/test";

export const TEST_USER = {
  id: "user_e2e_01",
  email: "e2e.writer@example.com",
  displayName: "E2E Writer",
  role: "writer",
  emailVerified: true
} as const;

export const TEST_SESSION = {
  token: "sess_e2e_01",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: TEST_USER
} as const;

export async function seedSession(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/me", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: TEST_USER, expiresAt: TEST_SESSION.expiresAt })
    })
  );
}

export async function clearSession(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/me", async (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "unauthorized" })
    })
  );
}
