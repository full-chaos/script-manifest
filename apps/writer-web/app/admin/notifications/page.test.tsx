import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminNotificationsPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function makeDefaultFetch() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/v1/admin/notifications/templates")) {
      return jsonResponse({ templates: [] });
    }
    return jsonResponse({ broadcasts: [], total: 0 });
  });
}

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminNotificationsPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminNotificationsPage", () => {
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
    expect(screen.getByText("Notification Management")).toBeInTheDocument();
    expect(screen.queryByText("No templates")).not.toBeInTheDocument();
  });

  it("renders templates and history empty states", async () => {
    vi.stubGlobal("fetch", makeDefaultFetch());
    renderPage();
    await screen.findByText("Notification Management");
    expect(screen.getByText("No templates")).toBeInTheDocument();
    expect(screen.getByText("No broadcasts")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message on templates fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("templates")) {
          return jsonResponse({ message: "Forbidden" }, 403);
        }
        return jsonResponse({ broadcasts: [], total: 0 });
      })
    );
    renderPage();
    await screen.findByText("Forbidden");
  });

  it("invalidates history cache after sending a broadcast", async () => {
    const user = userEvent.setup();
    let historyGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("templates") && method === "GET") {
        return jsonResponse({ templates: [] });
      }
      if (url.includes("history") && method === "GET") {
        historyGetCount++;
        return jsonResponse({ broadcasts: [], total: 0 });
      }
      // POST broadcast or direct
      return jsonResponse({ message: "Sent" });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("No broadcasts");
    const countBeforeMutation = historyGetCount;

    await user.type(screen.getByPlaceholderText(/notification subject/i), "Test subject");
    await user.type(screen.getByPlaceholderText(/write your notification/i), "Test body");
    await user.click(screen.getByRole("button", { name: /send notification/i }));

    await waitFor(() => {
      expect(historyGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
