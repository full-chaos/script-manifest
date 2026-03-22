import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransactionsPage from "./page";

vi.mock("../../components/toast", () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn()
  })
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("TransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders transactions correctly", async () => {
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        orders: [{
          id: "ord_1",
          createdAt: "2026-03-08T10:00:00Z",
          status: "completed",
          priceCents: 2500,
          serviceName: "Script Coverage",
          receiptUrl: "https://receipt.stripe.com/abc"
        }]
      })
    }));

    render(<TransactionsPage />);

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
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ orders: [] })
    }));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    });
  });
});
