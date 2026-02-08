import type { AuthSessionResponse, AuthUser } from "@script-manifest/contracts";

export const SESSION_STORAGE_KEY = "script_manifest_session";

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
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function readStoredUserId(): string | null {
  return readStoredSession()?.user.id ?? null;
}

export function getAuthHeaders(): Record<string, string> {
  const session = readStoredSession();

  if (session) {
    return { authorization: `Bearer ${session.token}` };
  }

  return {};
}

export function formatUserLabel(user: AuthUser): string {
  return `${user.displayName} (${user.email})`;
}
