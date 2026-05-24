import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { fetcher } from "../../../lib/fetcher";
import { ToastProvider } from "../../../components/toast";
import ProviderProfilePage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prov_1" })
}));

const SWR_OPTS = { fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false } as const;

const baseProvider = {
  id: "prov_1",
  userId: "user_1",
  displayName: "Provider One",
  bio: "Coverage specialist",
  specialties: ["Drama"],
  status: "active",
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  verificationState: "verified",
  verifiedAt: "2026-05-24T12:00:00.000Z",
  verifiedByUserId: "admin_01",
  verificationNotes: "Identity reviewed",
  verificationUpdatedAt: "2026-05-24T12:00:00.000Z",
  badge: {
    kind: "verified_provider",
    label: "Verified provider",
    description: "Script Manifest reviewed this provider's identity and coverage history.",
    verifiedAt: "2026-05-24T12:00:00.000Z"
  },
  avgRating: 4.7,
  totalOrdersCompleted: 22,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("ProviderProfilePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
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
            services: [{
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
            }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ provider: baseProvider }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("renders provider profile and services", async () => {
    render(
      <SWRConfig value={SWR_OPTS}>
        <ToastProvider><ProviderProfilePage /></ToastProvider>
      </SWRConfig>
    );

    expect(await screen.findByText("Provider One")).toBeInTheDocument();
    expect(screen.getByText("Verified provider")).toBeInTheDocument();
    expect(screen.getByText("Script Manifest reviewed this provider's identity and coverage history.")).toBeInTheDocument();
    expect(screen.getByText("Trust & policies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Coverage SLA" })).toHaveAttribute("href", "/policies/coverage-sla");
    expect(screen.getByRole("link", { name: "Dispute & refund policy" })).toHaveAttribute("href", "/policies/dispute-refund");
    expect(screen.getByText("Services Offered")).toBeInTheDocument();
  });

  it("shows empty state for reviews when none exist", async () => {
    render(
      <SWRConfig value={SWR_OPTS}>
        <ToastProvider><ProviderProfilePage /></ToastProvider>
      </SWRConfig>
    );

    expect(await screen.findByText("Provider One")).toBeInTheDocument();
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("shows provider not found when provider endpoint returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      })
    ));

    render(
      <SWRConfig value={SWR_OPTS}>
        <ToastProvider><ProviderProfilePage /></ToastProvider>
      </SWRConfig>
    );

    expect(await screen.findByText("Provider not found")).toBeInTheDocument();
  });
});
