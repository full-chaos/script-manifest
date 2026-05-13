import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminModerationPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockReport = {
  id: "report_01",
  reporterId: "user_reporter",
  contentType: "script",
  contentId: "script_001",
  reason: "spam",
  description: "Copied content",
  status: "pending",
  resolvedByUserId: null,
  resolution: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminModerationPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminModerationPage", () => {
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
    expect(screen.getByText("Content Moderation Queue")).toBeInTheDocument();
    expect(screen.queryByText("No reports found")).not.toBeInTheDocument();
  });

  it("renders moderation queue empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ reports: [] }))
    );
    renderPage();
    await screen.findByText("Content Moderation Queue");
    expect(screen.getByText("No reports found")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Insufficient permissions" }, 403))
    );
    renderPage();
    await screen.findByText("Insufficient permissions");
  });

  it("invalidates list cache after taking action", async () => {
    const user = userEvent.setup();
    let listGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/moderation/queue") && method === "GET") {
        listGetCount++;
        return jsonResponse({ reports: [mockReport] });
      }
      // POST action
      return jsonResponse({ report: { ...mockReport, status: "actioned" } });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Copied content");
    const countBeforeMutation = listGetCount;

    await user.click(screen.getByRole("button", { name: /take action/i }));

    const reasonField = screen.getByPlaceholderText(/explain the reason/i);
    await user.type(reasonField, "Spam content removed");

    await user.click(screen.getByRole("button", { name: /submit action/i }));

    await waitFor(() => {
      expect(listGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
