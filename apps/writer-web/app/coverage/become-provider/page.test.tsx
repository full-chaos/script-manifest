import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageProvider } from "@script-manifest/contracts";
import { ToastProvider } from "../../components/toast";
import BecomeProviderPage from "./page";

function renderPage() {
  return render(
    <ToastProvider>
      <BecomeProviderPage />
    </ToastProvider>
  );
}

function setSession(userId: string) {
  window.localStorage.setItem(
    "script_manifest_session",
    JSON.stringify({
      token: "sess_coverage",
      expiresAt: "2026-02-28T00:00:00.000Z",
      user: {
        id: userId,
        email: "provider@example.com",
        displayName: "Provider User"
      }
    })
  );
}

function makeProvider(overrides: Partial<CoverageProvider> = {}): CoverageProvider {
  return {
    id: "prov_01",
    userId: "user_provider_01",
    displayName: "Page One Coverage",
    bio: "Detailed script analysis.",
    specialties: ["Drama"],
    status: "pending_verification",
    stripeAccountId: "acct_01",
    stripeOnboardingComplete: false,
    avgRating: null,
    totalOrdersCompleted: 0,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("BecomeProviderPage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("requests Stripe onboarding via GET and uses the { url } response", async () => {
    const provider = makeProvider();
    setSession(provider.userId);

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/v1/coverage/providers") {
        return jsonResponse({ providers: [provider] });
      }
      if (url === `/api/v1/coverage/providers/${provider.id}/stripe-onboarding`) {
        return jsonResponse({ url: "#stripe-onboarding" });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Complete Stripe Setup" }));

    await waitFor(() => {
      expect(window.location.hash).toBe("#stripe-onboarding");
    });

    const onboardingCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      return url.includes("/stripe-onboarding");
    });

    expect(onboardingCall).toBeDefined();
    expect(onboardingCall?.[1]).toMatchObject({ method: "GET" });
  });

  it("shows pending verification guidance", async () => {
    const provider = makeProvider({ status: "pending_verification", stripeOnboardingComplete: false });
    setSession(provider.userId);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ providers: [provider] }))
    );

    renderPage();

    expect(await screen.findByText("Action required: complete Stripe setup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Stripe Setup" })).toBeInTheDocument();
  });

  it("shows suspension guidance", async () => {
    const provider = makeProvider({ status: "suspended", stripeOnboardingComplete: true });
    setSession(provider.userId);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ providers: [provider] }))
    );

    renderPage();

    expect(await screen.findByText("Account suspended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Stripe Setup" })).not.toBeInTheDocument();
  });

  it("shows deactivation guidance", async () => {
    const provider = makeProvider({ status: "deactivated", stripeOnboardingComplete: true });
    setSession(provider.userId);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ providers: [provider] }))
    );

    renderPage();

    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Stripe Setup" })).not.toBeInTheDocument();
  });
});
