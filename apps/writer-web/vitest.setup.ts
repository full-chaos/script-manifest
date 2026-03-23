import "@testing-library/jest-dom/vitest";
import React from "react";
import { beforeEach, vi } from "vitest";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}

const memoryStorage = createMemoryStorage();

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true
  });
});

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...props }, children)
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
  }) => React.createElement("img", { src, alt, ...props })
}));

const mockUseAuth = vi.fn<() => { user: null | Record<string, unknown>; loading: boolean }>(
  () => ({ user: null, loading: false }),
);
const mockRefreshAuth = vi.fn();

vi.mock("./app/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
  refreshAuth: () => mockRefreshAuth(),
  AUTH_CHANGED_EVENT: "auth-changed",
  SESSION_CHANGED_EVENT: "script_manifest_session_changed",
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

export { mockUseAuth, mockRefreshAuth };
