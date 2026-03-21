import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import AdminSecurityPage from "./page";

describe("AdminSecurityPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ blocks: [], total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("renders security management sections", async () => {
    render(
      <ToastProvider>
        <AdminSecurityPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Security")).toBeInTheDocument();
    expect(screen.getByText("IP Blocklist")).toBeInTheDocument();
    expect(screen.getByText("No blocked IPs")).toBeInTheDocument();
  });
});
