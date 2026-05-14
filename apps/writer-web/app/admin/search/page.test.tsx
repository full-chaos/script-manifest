import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import SearchAdminPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockSearchStatus = {
  backend: "postgres_fts",
  searchHealth: "ready",
  documentCount: 12,
  indexSizeBytes: 1024,
  lastSyncAt: null,
  notes: []
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <SearchAdminPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("SearchAdminPage", () => {
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
    expect(screen.getByText("Competition Search")).toBeInTheDocument();
    expect(screen.queryByText("Search Health")).not.toBeInTheDocument();
  });

  it("renders search status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse(mockSearchStatus))
    );
    renderPage();
    await screen.findByText("Competition Search");
    expect(screen.getByText("Search Health")).toBeInTheDocument();
    expect(screen.getByText("Indexed Competitions")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Forbidden: admin only" }, 403))
    );
    renderPage();
    await screen.findByText("Forbidden: admin only");
  });

  it("invalidates status cache after reindex", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" || url.includes("/status")) {
        getCallCount++;
        return jsonResponse(mockSearchStatus);
      }
      // POST reindex
      return jsonResponse({ message: "Reindex complete", type: "reindex", status: "ok" });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Search Health");
    const countBeforeMutation = getCallCount;

    await user.click(screen.getByRole("button", { name: /refresh status/i }));

    // After mutation, SWR revalidates the status key
    await screen.findByText("Search Health");
    expect(getCallCount).toBeGreaterThan(countBeforeMutation);
  });
});
