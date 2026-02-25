import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageDelivery, CoverageOrder, CoverageProvider } from "@script-manifest/contracts";
import { ToastProvider } from "../../../components/toast";
import OrderDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order_01" })
}));

function renderPage() {
  return render(
    <ToastProvider>
      <OrderDetailPage />
    </ToastProvider>
  );
}

function setSession(userId: string) {
  window.localStorage.setItem(
    "script_manifest_session",
    JSON.stringify({
      token: "sess_order",
      expiresAt: "2026-02-28T00:00:00.000Z",
      user: {
        id: userId,
        email: "writer@example.com",
        displayName: "Writer User"
      }
    })
  );
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
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("fetches delivery from the dedicated delivery endpoint", async () => {
    setSession("user_writer_01");
    const order = makeOrder();
    const provider = makeProvider();
    const delivery = makeDelivery();

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/v1/coverage/orders/order_01") {
        return jsonResponse({ order });
      }
      if (url === "/api/v1/coverage/orders/order_01/delivery") {
        return jsonResponse({ delivery });
      }
      if (url === "/api/v1/coverage/providers/prov_01") {
        return jsonResponse({ provider });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText("Coverage Delivery")).toBeInTheDocument();
    expect(screen.getByText("Strong concept and clean pacing.")).toBeInTheDocument();

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : (input as Request).url
    );
    expect(calledUrls).toContain("/api/v1/coverage/orders/order_01/delivery");
  });

  it("shows provider actions when signed-in user matches provider user id", async () => {
    setSession("user_provider_01");
    const order = makeOrder({
      status: "payment_held",
      writerUserId: "different_writer",
      providerId: "prov_01"
    });
    const provider = makeProvider({ id: "prov_01", userId: "user_provider_01" });

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === "/api/v1/coverage/orders/order_01") {
          return jsonResponse({ order });
        }
        if (url === "/api/v1/coverage/orders/order_01/delivery") {
          return jsonResponse({ error: "delivery_not_found" }, 404);
        }
        if (url === "/api/v1/coverage/providers/prov_01") {
          return jsonResponse({ provider });
        }
        return jsonResponse({}, 404);
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Claim Order" })).toBeInTheDocument();
    });
  });
});
