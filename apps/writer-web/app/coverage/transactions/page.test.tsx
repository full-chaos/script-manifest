import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { fetcher } from "../../lib/fetcher";
import { mockUseAuth } from "../../../vitest.setup";
import { ToastProvider } from "../../components/toast";
import TransactionsPage from "./page";

function renderPage() {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
      }}
    >
      <ToastProvider>
        <TransactionsPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "user_01", email: "user@example.com", displayName: "User", role: "writer", emailVerified: true },
      loading: false
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders transactions correctly", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          orders: [{
            id: "ord_1",
            createdAt: "2026-03-08T10:00:00Z",
            status: "completed",
            priceCents: 2500,
            serviceName: "Script Coverage",
            receiptUrl: "https://receipt.stripe.com/abc"
          }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ));

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Transaction History" })).toBeInTheDocument();
    });

    expect(screen.getByText("Script Coverage")).toBeInTheDocument();
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();

    const invoiceLink = screen.getByRole("link", { name: "Invoice" });
    expect(invoiceLink).toHaveAttribute("href", "https://receipt.stripe.com/abc");
    expect(invoiceLink).toHaveAttribute("target", "_blank");
  });

  it("renders empty state when no transactions exist", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ orders: [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    ));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    });
  });
});
