import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminDisputesPage from "./page";

describe("AdminDisputesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ disputes: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders empty disputes state", async () => {
    render(
      <ToastProvider>
        <AdminDisputesPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Dispute Management")).toBeInTheDocument();
    expect(screen.getByText("No disputes")).toBeInTheDocument();
  });
});
