import { vi } from "vitest";
vi.unmock("./AuthProvider");

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig, mutate as globalMutate } from "swr";
import {
  AuthProvider,
  AUTH_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
  refreshAuth,
  useAuth,
} from "./AuthProvider";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false, revalidateOnReconnect: false }}>
      <AuthProvider>{children}</AuthProvider>
    </SWRConfig>
  );
}

function Probe() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{loading ? "yes" : "no"}</span>
      <span data-testid="user">{user ? user.id : "anon"}</span>
    </div>
  );
}

type SessionFixture = { user: { id: string; email: string; displayName: string; role: string; emailVerified: boolean } };

function buildUser(id: string): SessionFixture {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      displayName: id,
      role: "writer",
      emailVerified: true,
    },
  };
}

function mockAuthFetch(
  sequence: Array<"ok" | "unauthorized" | "error"> | ((call: number) => "ok" | "unauthorized" | "error"),
  userIds: string[] = ["u_1"],
) {
  let call = 0;
  let nextId = 0;
  const getOutcome =
    typeof sequence === "function" ? sequence : (c: number) => sequence[Math.min(c, sequence.length - 1)];
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (!url.includes("/api/v1/auth/me")) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    const outcome = getOutcome(call);
    call += 1;
    if (outcome === "ok") {
      const id = userIds[Math.min(nextId, userIds.length - 1)] ?? "u_1";
      nextId += 1;
      return {
        ok: true,
        status: 200,
        json: async () => buildUser(id),
      } as Response;
    }
    if (outcome === "unauthorized") {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    }
    throw new Error("network");
  });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await globalMutate(() => true, undefined, { revalidate: false });
    vi.restoreAllMocks();
  });

  it("populates user from /api/v1/auth/me on mount", async () => {
    mockAuthFetch(["ok"]);
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("u_1");
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("no");
  });

  it("returns null user on 401", async () => {
    mockAuthFetch(["unauthorized"]);
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("no");
    });
    expect(screen.getByTestId("user")).toHaveTextContent("anon");
  });

  it("returns null user on network error (does not throw)", async () => {
    mockAuthFetch(["error"]);
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("no");
    });
    expect(screen.getByTestId("user")).toHaveTextContent("anon");
  });

  it("revalidates session when AUTH_CHANGED_EVENT fires", async () => {
    const spy = mockAuthFetch(["unauthorized", "ok"], ["u_revalidated"]);
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("anon");
    });
    const initialCalls = spy.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("u_revalidated");
    });
    expect(spy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it("refreshAuth() triggers SWR revalidation", async () => {
    const spy = mockAuthFetch(["ok", "ok"], ["u_first", "u_second"]);
    render(<Probe />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("u_first");
    });
    const initialCalls = spy.mock.calls.length;

    act(() => {
      refreshAuth();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("u_second");
    });
    expect(spy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it("dispatches SESSION_CHANGED_EVENT when user identity changes", async () => {
    mockAuthFetch(["ok", "ok"], ["u_a", "u_b"]);
    const sessionListener = vi.fn();
    window.addEventListener(SESSION_CHANGED_EVENT, sessionListener);

    try {
      render(<Probe />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("u_a");
      });
      expect(sessionListener).toHaveBeenCalled();
      const callsAfterMount = sessionListener.mock.calls.length;

      act(() => {
        refreshAuth();
      });

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("u_b");
      });
      expect(sessionListener.mock.calls.length).toBeGreaterThan(callsAfterMount);
    } finally {
      window.removeEventListener(SESSION_CHANGED_EVENT, sessionListener);
    }
  });

  it("does not dispatch SESSION_CHANGED_EVENT when user is unchanged", async () => {
    mockAuthFetch(["ok", "ok"], ["u_same", "u_same"]);
    const sessionListener = vi.fn();
    window.addEventListener(SESSION_CHANGED_EVENT, sessionListener);

    try {
      render(<Probe />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("u_same");
      });
      const callsAfterMount = sessionListener.mock.calls.length;

      act(() => {
        refreshAuth();
      });

      await waitFor(() => {
        expect(screen.getByTestId("user")).toHaveTextContent("u_same");
      });
      expect(sessionListener.mock.calls.length).toBe(callsAfterMount);
    } finally {
      window.removeEventListener(SESSION_CHANGED_EVENT, sessionListener);
    }
  });
});
