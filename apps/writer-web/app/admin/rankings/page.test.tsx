import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminRankingsPage from "./page";

describe("AdminRankingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ appeals: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders rankings appeals tab", async () => {
    render(
      <ToastProvider>
        <AdminRankingsPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Rankings administration")).toBeInTheDocument();
    expect(screen.getByText("No appeals found")).toBeInTheDocument();
  });
});
