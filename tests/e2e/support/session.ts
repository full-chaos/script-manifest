import type { Page } from "@playwright/test";

export const TEST_USER = {
  id: "user_e2e_01",
  email: "e2e.writer@example.com",
  displayName: "E2E Writer",
  role: "writer"
} as const;

export const TEST_SESSION = {
  token: "sess_e2e_01",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: TEST_USER
} as const;

const SESSION_STORAGE_KEY = "script_manifest_session";

export async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((session) => {
    window.localStorage.setItem("script_manifest_session", JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("script_manifest_session_changed"));
  }, TEST_SESSION);
}

export async function clearSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.removeItem("script_manifest_session");
    window.dispatchEvent(new CustomEvent("script_manifest_session_changed"));
  });
}

export function sessionStorageKey(): string {
  return SESSION_STORAGE_KEY;
}
