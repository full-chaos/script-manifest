import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminRankingsPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockAppeal = {
  id: "appeal_01",
  writerId: "writer_001",
  reason: "Incorrect ranking score",
  status: "open",
  resolutionNote: null,
  resolvedByUserId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function makeDefaultFetch(appeals: unknown[] = []) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/appeals")) {
      return jsonResponse({ appeals });
    }
    if (url.includes("/flags")) {
      return jsonResponse({ flags: [] });
    }
    if (url.includes("/prestige")) {
      return jsonResponse({ entries: [] });
    }
    return jsonResponse({});
  });
}

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminRankingsPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminRankingsPage", () => {
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
    expect(screen.getByText("Rankings administration")).toBeInTheDocument();
    expect(screen.queryByText("No appeals found")).not.toBeInTheDocument();
  });

  it("renders rankings appeals tab", async () => {
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Rankings administration");
    expect(screen.getByText("No appeals found")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message on appeals fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Not authorized" }, 403))
    );
    renderPage();
    await screen.findByText("Not authorized");
  });

  it("invalidates appeals cache after resolving an appeal", async () => {
    const user = userEvent.setup();
    let appealsGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/appeals") && !url.includes("/resolve") && method === "GET") {
        appealsGetCount++;
        return jsonResponse({ appeals: [mockAppeal] });
      }
      if (url.includes("/resolve") && method === "POST") {
        return jsonResponse({ appeal: { ...mockAppeal, status: "upheld" } });
      }
      if (url.includes("/flags")) {
        return jsonResponse({ flags: [] });
      }
      if (url.includes("/prestige")) {
        return jsonResponse({ entries: [] });
      }
      return jsonResponse({});
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Incorrect ranking score");
    const countBeforeMutation = appealsGetCount;

    await user.click(screen.getByRole("button", { name: /^resolve$/i }));
    await user.click(screen.getByRole("button", { name: /submit decision/i }));

    await waitFor(() => {
      expect(appealsGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
