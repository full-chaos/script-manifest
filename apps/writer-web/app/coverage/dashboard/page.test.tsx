import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/toast";
import ProviderDashboardPage from "./page";

describe("ProviderDashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_coverage",
        expiresAt: "2026-03-01T00:00:00.000Z",
        user: { id: "user_provider_1", email: "provider@example.com", displayName: "Provider" }
      })
    );
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
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
    });
  });

  it("renders provider dashboard", async () => {
    render(
      <ToastProvider>
        <ProviderDashboardPage />
      </ToastProvider>
    );

    expect(await screen.findByText("Coverage Pro")).toBeInTheDocument();
    expect(screen.getByText(/Incoming/)).toBeInTheDocument();
  });
});
