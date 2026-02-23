import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredSession,
  formatUserLabel,
  getAuthHeaders,
  readStoredSession,
  readStoredUserId,
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
    displayName: "Writer One"
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
    expect(session?.token).toBe("tok_abc123");
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

  it("persists session to localStorage", () => {
    writeStoredSession(SAMPLE_SESSION);
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.token).toBe("tok_abc123");
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

  it("returns an empty object when no session exists", () => {
    expect(getAuthHeaders()).toEqual({});
  });

  it("returns a Bearer authorization header when a session exists", () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SAMPLE_SESSION));
    const headers = getAuthHeaders();
    expect(headers).toEqual({ authorization: "Bearer tok_abc123" });
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
    const label = formatUserLabel({ id: "u1", email: "test@x.com", displayName: "Test User" });
    expect(label).toBe("Test User (test@x.com)");
  });
});
