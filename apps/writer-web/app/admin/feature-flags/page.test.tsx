import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import FeatureFlagsPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockFlag = {
  key: "new_dashboard",
  description: "Enable new dashboard",
  enabled: false,
  rolloutPct: 0,
  userAllowlist: [],
  updatedBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <FeatureFlagsPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("FeatureFlagsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders loading state initially", () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise(() => {})));
    renderPage();
    expect(screen.getByText("Feature Flags")).toBeInTheDocument();
    expect(screen.queryByText("No feature flags")).not.toBeInTheDocument();
  });

  it("renders feature flags empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ flags: [] }))
    );
    renderPage();
    await screen.findByText("Feature Flags");
    expect(screen.getByText("No feature flags")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Forbidden by admin policy" }, 403))
    );
    renderPage();
    await screen.findByText("Forbidden by admin policy");
  });

  it("invalidates list cache after toggling a flag", async () => {
    const user = userEvent.setup();
    let listGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url === "/api/v1/admin/feature-flags" && method === "GET") {
        listGetCount++;
        return jsonResponse({ flags: [mockFlag] });
      }
      // PUT toggle
      return jsonResponse({ flag: { ...mockFlag, enabled: true } });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("new_dashboard");
    const countBeforeMutation = listGetCount;

    await user.click(screen.getByRole("switch", { name: /toggle new_dashboard/i }));

    await waitFor(() => {
      expect(listGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
