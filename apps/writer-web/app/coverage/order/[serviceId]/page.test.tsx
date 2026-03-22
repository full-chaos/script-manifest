import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockUseAuth } from "../../../../vitest.setup";
import { ToastProvider } from "../../../components/toast";
import OrderFlowPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ serviceId: "service_01" })
}));

describe("OrderFlowPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "writer_1",
        email: "writer@example.com",
        displayName: "Writer",
        role: "writer",
        emailVerified: true
      },
      loading: false
    });
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          service: {
            id: "service_01",
            providerId: "prov_1",
            title: "Feature Coverage",
            description: "In-depth notes",
            tier: "standard",
            maxPages: 120,
            turnaroundDays: 7,
            priceCents: 12000,
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
  });

  it("renders service order form", async () => {
    render(
      <ToastProvider>
        <OrderFlowPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Feature Coverage")).toBeInTheDocument();
    expect(screen.getByText("Order Form")).toBeInTheDocument();
  });
});
