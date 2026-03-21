import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/toast";
import ProviderProfilePage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prov_1" })
}));

describe("ProviderProfilePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/coverage/providers/prov_1/reviews")) {
        return new Response(JSON.stringify({ reviews: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/coverage/services")) {
        return new Response(
          JSON.stringify({
            services: [
              {
                id: "svc_1",
                providerId: "prov_1",
                title: "Pilot Notes",
                description: "Detailed notes",
                tier: "notable",
                maxPages: 120,
                turnaroundDays: 10,
                priceCents: 15000,
                status: "active",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          provider: {
            id: "prov_1",
            userId: "user_1",
            displayName: "Provider One",
            bio: "Coverage specialist",
            specialties: ["Drama"],
            status: "active",
            stripeAccountId: "acct_1",
            stripeOnboardingComplete: true,
            avgRating: 4.7,
            totalOrdersCompleted: 22,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
  });

  it("renders provider profile and services", async () => {
    render(
      <ToastProvider>
        <ProviderProfilePage />
      </ToastProvider>
    );

    expect(await screen.findByText("Provider One")).toBeInTheDocument();
    expect(screen.getByText("Services Offered")).toBeInTheDocument();
    expect(screen.getByText("Pilot Notes")).toBeInTheDocument();
  });
});
