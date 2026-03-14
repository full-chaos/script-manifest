import type { AuthSessionResponse, AuthUser } from "@script-manifest/contracts";

export const SESSION_STORAGE_KEY = "script_manifest_session";
export const SESSION_CHANGED_EVENT = "script_manifest_session_changed";

/**
 * Read the stored session for UI purposes.
 *
 * The authoritative session token is now stored in an HttpOnly cookie managed
 * server-side by the BFF. This function reads only from localStorage, which
 * holds non-sensitive user info (displayName, email, id, expiresAt) written
 * by writeStoredSession(). The raw token is never stored here.
 *
 * Falls back gracefully: returns null when localStorage is unavailable or empty.
 */
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

/**
 * Persist non-sensitive session info to localStorage for UI use.
 *
 * The token field is stripped before writing so it is never exposed to
 * client-side JavaScript. The HttpOnly cookie managed by the BFF holds
 * the authoritative token.
 */
export function writeStoredSession(session: AuthSessionResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  // Strip the raw token — never store it in localStorage.
  // The HttpOnly cookie is the authoritative store for the token.
  const { token: _token, ...safeSession } = session;
  const safeWithPlaceholder: AuthSessionResponse = {
    ...safeSession,
    token: "" // keep shape compatible with AuthSessionResponse type
  };

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeWithPlaceholder));
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));
}

/**
 * Clear the stored session from localStorage and dispatch the session-changed
 * event so UI components can react immediately.
 *
 * Callers that need to log out should POST to /api/v1/auth/logout, which
 * clears the HttpOnly cookie server-side. This function only handles the
 * client-side localStorage cleanup.
 */
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

/**
 * Returns auth headers for client-side requests that go through the BFF proxy.
 *
 * With the HttpOnly cookie migration, all API calls should be routed through
 * the BFF (/api/v1/...) which reads the cookie server-side. This function
 * returns an empty object because the token is no longer accessible client-side.
 *
 * Kept for backward compatibility — callers can still call this safely.
 */
export function getAuthHeaders(): Record<string, string> {
  // Token is now in an HttpOnly cookie, not accessible to JavaScript.
  // All requests go through the BFF proxy which injects the Authorization header.
  return {};
}

export function formatUserLabel(user: AuthUser): string {
  return `${user.displayName} (${user.email})`;
}
