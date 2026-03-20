import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetRefreshThrottle,
  clearStoredSession,
  formatUserLabel,
  getAuthHeaders,
  readStoredSession,
  readStoredUserId,
  refreshSession,
  SESSION_CHANGED_EVENT,
  SESSION_STORAGE_KEY,
  writeStoredSession
} from "./authSession";

const SAMPLE_SESSION = {
  token: "tok_abc123",
  expiresAt: "2026-12-31T00:00:00.000Z",
  user: {
    id: "writer_01",
    email: "writer@example.com",
    displayName: "Writer One",
    emailVerified: false
  }
};

describe("readStoredSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when localStorage is empty", () => {
    expect(readStoredSession()).toBeNull();
  });

  it("returns the parsed session when one is stored", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    const session = readStoredSession();
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe("writer_01");
  });

  it("returns null when stored value is malformed JSON", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, "not-valid-json{{{");
    expect(readStoredSession()).toBeNull();
  });
});

describe("writeStoredSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists session to localStorage without the raw token", () => {
    writeStoredSession(SAMPLE_SESSION);
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // Token must NOT be stored in localStorage — HttpOnly cookie handles it
    expect(parsed.token).toBe("");
    expect(parsed.user.id).toBe("writer_01");
    expect(parsed.user.email).toBe("writer@example.com");
    expect(parsed.expiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("dispatches the session-changed custom event", () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_CHANGED_EVENT, listener);
    writeStoredSession(SAMPLE_SESSION);
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("clearStoredSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("removes session from localStorage", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    clearStoredSession();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("dispatches the session-changed custom event", () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_CHANGED_EVENT, listener);
    clearStoredSession();
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("getAuthHeaders", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty object — token is in HttpOnly cookie, not accessible client-side", () => {
    expect(getAuthHeaders()).toEqual({});
  });

  it("returns an empty object even when a session exists in localStorage", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    // Token is no longer exposed to client-side JS; BFF proxy handles auth
    expect(getAuthHeaders()).toEqual({});
  });
});

describe("readStoredUserId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when no session exists", () => {
    expect(readStoredUserId()).toBeNull();
  });

  it("returns the user id from the stored session", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    expect(readStoredUserId()).toBe("writer_01");
  });
});

describe("formatUserLabel", () => {
  it("formats display name and email together", () => {
    const label = formatUserLabel({ id: "u1", email: "test@x.com", displayName: "Test User", emailVerified: false });
    expect(label).toBe("Test User (test@x.com)");
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetRefreshThrottle();
    vi.unstubAllGlobals();
  });

  it("does nothing when no session exists in localStorage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await refreshSession();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/v1/auth/me and updates localStorage on success", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: {
          id: "u1",
          email: "a@b.com",
          displayName: "A",
          role: "admin",
          emailVerified: true
        },
        expiresAt: "2026-12-31T00:00:00.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshSession();

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/auth/me", { credentials: "include" });
    const stored = readStoredSession();
    expect(stored?.user.role).toBe("admin");
    expect(stored?.user.id).toBe("u1");
  });

  it("keeps existing session on fetch failure", async () => {
    const originalSession = {
      ...SAMPLE_SESSION,
      user: {
        ...SAMPLE_SESSION.user,
        role: "member"
      }
    };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(originalSession));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn()
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshSession();

    expect(readStoredSession()).toEqual(originalSession);
  });

  it("throttles calls within 30 seconds", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        user: SAMPLE_SESSION.user,
        expiresAt: SAMPLE_SESSION.expiresAt
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshSession();
    await refreshSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
