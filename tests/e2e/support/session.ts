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
const SESSION_EVENT_NAME = `${SESSION_STORAGE_KEY}_changed`;

export async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(
    (session, storageKey, eventName) => {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
      window.dispatchEvent(new CustomEvent(eventName));
    },
    TEST_SESSION,
    SESSION_STORAGE_KEY,
    SESSION_EVENT_NAME
  );
}

export async function clearSession(page: Page): Promise<void> {
  await page.addInitScript(
    (storageKey, eventName) => {
      window.localStorage.removeItem(storageKey);
      window.dispatchEvent(new CustomEvent(eventName));
    },
    SESSION_STORAGE_KEY,
    SESSION_EVENT_NAME
  );
}

export function sessionStorageKey(): string {
  return SESSION_STORAGE_KEY;
}
