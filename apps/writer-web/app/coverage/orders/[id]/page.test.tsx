import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import type { CoverageDelivery, CoverageOrder, CoverageProvider } from "@script-manifest/contracts";
import { fetcher } from "../../../lib/fetcher";
import { mockUseAuth } from "../../../../vitest.setup";
import { ToastProvider } from "../../../components/toast";
import OrderDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order_01" })
}));

const SWR_OPTS = { fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false };

function setSession(userId: string) {
  mockUseAuth.mockReturnValue({
    user: {
      id: userId,
      email: "writer@example.com",
      displayName: "Writer User",
      role: "writer",
      emailVerified: true
    },
    loading: false
  });
}

function makeOrder(overrides: Partial<CoverageOrder> = {}): CoverageOrder {
  return {
    id: "order_01",
    writerUserId: "user_writer_01",
    providerId: "prov_01",
    serviceId: "svc_01",
    scriptId: "script_01",
    projectId: "project_01",
    status: "delivered",
    priceCents: 15000,
    platformFeeCents: 1500,
    providerPayoutCents: 13500,
    stripePaymentIntentId: "pi_01",
    stripeTransferId: null,
    slaDeadline: "2026-02-24T10:00:00.000Z",
    deliveredAt: "2026-02-23T10:00:00.000Z",
    createdAt: "2026-02-20T10:00:00.000Z",
    updatedAt: "2026-02-23T10:00:00.000Z",
    receiptUrl: null,
    paymentFailureReason: null,
    ...overrides
  };
}

function makeProvider(overrides: Partial<CoverageProvider> = {}): CoverageProvider {
  return {
    id: "prov_01",
    userId: "user_provider_01",
    displayName: "Provider One",
    bio: "Coverage specialist",
    specialties: ["Thriller"],
    status: "active",
    stripeAccountId: "acct_provider_01",
    stripeOnboardingComplete: true,
    verificationState: "verified",
    verifiedAt: "2026-02-15T10:00:00.000Z",
    verifiedByUserId: "admin_01",
    verificationNotes: "Identity and portfolio reviewed.",
    verificationUpdatedAt: "2026-02-15T10:00:00.000Z",
    badge: {
      kind: "verified_provider",
      label: "Verified provider",
      description: "This provider has been reviewed by Script Manifest.",
      verifiedAt: "2026-02-15T10:00:00.000Z"
    },
    avgRating: 4.8,
    totalOrdersCompleted: 14,
    createdAt: "2026-02-10T10:00:00.000Z",
    updatedAt: "2026-02-23T10:00:00.000Z",
    ...overrides
  };
}

function makeDelivery(overrides: Partial<CoverageDelivery> = {}): CoverageDelivery {
  return {
    id: "delivery_01",
    orderId: "order_01",
    summary: "Strong concept and clean pacing.",
    strengths: "Distinct voice",
    weaknesses: "Act two needs compression",
    recommendations: "Tighten midpoint turn",
    score: 82,
    fileKey: null,
    fileName: null,
    createdAt: "2026-02-23T10:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
  });

  afterEach(() => {
    cleanup();
  });

  it("fetches delivery from the dedicated delivery endpoint", async () => {
    setSession("user_writer_01");
    const order = makeOrder();
    const provider = makeProvider();
    const delivery = makeDelivery();

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/v1/coverage/orders/order_01") return jsonResponse({ order });
      if (url === "/api/v1/coverage/orders/order_01/delivery") return jsonResponse({ delivery });
      if (url === "/api/v1/coverage/providers/prov_01") return jsonResponse({ provider });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderDetailPage))
      )
    );

    expect(await screen.findByText("Coverage Delivery")).toBeInTheDocument();
    expect(screen.getByText("Strong concept and clean pacing.")).toBeInTheDocument();

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : (input as Request).url
    );
    expect(calledUrls).toContain("/api/v1/coverage/orders/order_01/delivery");
  });

  it("shows provider actions when signed-in user matches provider user id", async () => {
    setSession("user_provider_01");
    const order = makeOrder({ status: "payment_held", writerUserId: "different_writer", providerId: "prov_01" });
    const provider = makeProvider({ id: "prov_01", userId: "user_provider_01" });

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === "/api/v1/coverage/orders/order_01") return jsonResponse({ order });
        if (url === "/api/v1/coverage/orders/order_01/delivery") return jsonResponse({ error: "not_found" }, 404);
        if (url === "/api/v1/coverage/providers/prov_01") return jsonResponse({ provider });
        return jsonResponse({}, 404);
      })
    );

    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderDetailPage))
      )
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Claim Order" })).toBeInTheDocument();
    });
  });

  it("shows payment failure recovery UI for writer on failed order", async () => {
    const failedOrder = makeOrder({ status: "payment_failed", paymentFailureReason: "Insufficient funds" });
    const provider = makeProvider();

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/v1/coverage/orders/order_01") return jsonResponse({ order: failedOrder });
      if (url === "/api/v1/coverage/providers/prov_01") return jsonResponse({ provider });
      return jsonResponse({}, 404);
    }));

    setSession("user_writer_01");
    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderDetailPage))
      )
    );

    await screen.findByRole("heading", { name: /Payment Failed/i });
    expect(screen.getByText(/insufficient funds/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry Payment/i })).toBeInTheDocument();
  });

  it("does not show retry button for provider on failed order", async () => {
    const failedOrder = makeOrder({ status: "payment_failed", writerUserId: "different_writer" });
    const provider = makeProvider({ userId: "user_provider_01" });

    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/v1/coverage/orders/order_01") return jsonResponse({ order: failedOrder });
      if (url === "/api/v1/coverage/providers/prov_01") return jsonResponse({ provider });
      return jsonResponse({}, 404);
    }));

    setSession("user_provider_01");
    render(
      React.createElement(
        SWRConfig,
        { value: SWR_OPTS },
        React.createElement(ToastProvider, null, React.createElement(OrderDetailPage))
      )
    );

    await screen.findByRole("heading", { name: /Payment Failed/i });
    expect(screen.queryByRole("button", { name: /Retry Payment/i })).not.toBeInTheDocument();
  });
});
