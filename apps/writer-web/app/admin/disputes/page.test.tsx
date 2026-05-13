import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import AdminDisputesPage from "./page";
import { fetcher } from "../../lib/fetcher";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const mockDispute = {
  id: "dispute_01",
  orderId: "order_001",
  reason: "quality_issue",
  status: "open",
  description: "Coverage was incomplete.",
  adminNotes: null,
  refundAmountCents: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminDisputesPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminDisputesPage", () => {
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
    expect(screen.getByText("Dispute Management")).toBeInTheDocument();
    expect(screen.queryByText("No disputes")).not.toBeInTheDocument();
  });

  it("renders empty disputes state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ disputes: [] }))
    );
    renderPage();
    await screen.findByText("Dispute Management");
    expect(screen.getByText("No disputes")).toBeInTheDocument();
  });

  it("surfaces ApiError 4xx message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ message: "Admin access required" }, 403))
    );
    renderPage();
    await screen.findByText("Admin access required");
  });

  it("invalidates list cache after resolving a dispute", async () => {
    const user = userEvent.setup();
    let listGetCount = 0;

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes("/disputes") && method === "GET") {
        listGetCount++;
        return jsonResponse({ disputes: [mockDispute] });
      }
      // PATCH resolve
      return jsonResponse({ dispute: { ...mockDispute, status: "resolved_no_refund" } });
    });

    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await screen.findByText("Order order_001");
    const countBeforeMutation = listGetCount;

    // Click the card-level button to open modal (type=button)
    const openBtns = screen.getAllByRole("button", { name: /resolve dispute/i });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

    // Fill required admin notes
    const notesField = screen.getByPlaceholderText(/explanation/i);
    await user.type(notesField, "Test resolution");

    // The modal submit button is last among matches (type=submit)
    const submitBtns = screen.getAllByRole("button", { name: /resolve dispute/i });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await user.click(submitBtns[submitBtns.length - 1]!);

    await waitFor(() => {
      expect(listGetCount).toBeGreaterThan(countBeforeMutation);
    });
  });
});
