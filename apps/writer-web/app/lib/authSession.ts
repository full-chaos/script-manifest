import type { AuthSessionResponse, AuthUser } from "@script-manifest/contracts";

export const SESSION_STORAGE_KEY = "script_manifest_session";
export const SESSION_CHANGED_EVENT = "script_manifest_session_changed";

export function readStoredSession(): AuthSessionResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSessionResponse;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSessionResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
}

export function readStoredUserId(): string | null {
  return readStoredSession()?.user.id ?? null;
}

export function formatUserLabel(user: AuthUser): string {
  return `${user.displayName} (${user.email})`;
}
