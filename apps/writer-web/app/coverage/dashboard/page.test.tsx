import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { fetcher } from "../../lib/fetcher";
import { mockUseAuth } from "../../../vitest.setup";
import { ToastProvider } from "../../components/toast";
import ProviderDashboardPage from "./page";

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
        <ProviderDashboardPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("ProviderDashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "user_provider_1",
        email: "provider@example.com",
        displayName: "Provider",
        role: "writer",
        emailVerified: true
      },
      loading: false
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/v1/coverage/providers")) {
        return new Response(
          JSON.stringify({
            providers: [
              {
                id: "prov_1",
                userId: "user_provider_1",
                displayName: "Coverage Pro",
                bio: "Bio",
                specialties: ["Drama"],
                status: "active",
                stripeAccountId: "acct_1",
                stripeOnboardingComplete: true,
                avgRating: 4.8,
                totalOrdersCompleted: 5,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("renders provider dashboard", async () => {
    renderPage();

    expect(await screen.findByText("Coverage Pro")).toBeInTheDocument();
    expect(screen.getByText(/Incoming/)).toBeInTheDocument();
  });

  it("shows 'not a provider yet' state when user has no provider profile", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user_no_provider", email: "x@example.com", displayName: "X", role: "writer", emailVerified: true },
      loading: false
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ providers: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ));

    renderPage();

    expect(await screen.findByText("Not a provider yet")).toBeInTheDocument();
  });
});
