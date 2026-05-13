import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { fetcher } from "../../../lib/fetcher";
import { mockUseAuth } from "../../../../vitest.setup";
import { ToastProvider } from "../../../components/toast";
import OrderFlowPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ serviceId: "service_01" })
}));

const SWR_OPTS = { fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false };

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
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
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
    ));
  });

  afterEach(() => {
    cleanup();
  });

  it("renders service order form", async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderFlowPage))
      )
    );

    expect(await screen.findByText("Feature Coverage")).toBeInTheDocument();
    expect(screen.getByText("Order Form")).toBeInTheDocument();
  });

  it("shows service not found when fetch returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    ));

    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderFlowPage))
      )
    );

    expect(await screen.findByText("Service not found")).toBeInTheDocument();
  });
});
