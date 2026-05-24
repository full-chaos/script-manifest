import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import { fetcher } from "../../lib/fetcher";
import AdminProvidersPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

const provider = {
  id: "prov_01",
  userId: "user_01",
  displayName: "Script Experts",
  bio: "Trusted coverage",
  specialties: ["Drama"],
  status: "active",
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  verificationState: "unverified",
  verifiedAt: null,
  verifiedByUserId: null,
  verificationNotes: null,
  verificationUpdatedAt: "2026-05-01T00:00:00.000Z",
  badge: {
    kind: "unverified_provider",
    label: "Unverified provider",
    description: "This provider has not completed Script Manifest verification yet.",
    verifiedAt: null
  },
  avgRating: null,
  totalOrdersCompleted: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <AdminProvidersPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("AdminProvidersPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders provider queue with verification state and event history", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/verification")) {
        return jsonResponse({ events: [{ id: "event_1", providerId: "prov_01", adminUserId: "admin_01", fromState: "unverified", toState: "verified", reason: "Identity reviewed", checklist: ["identity"], createdAt: "2026-05-24T00:00:00.000Z" }] });
      }
      return jsonResponse({ entries: [{ provider, latestReview: null }] });
    }));

    renderPage();

    expect(await screen.findByText("Provider Verification")).toBeInTheDocument();
    expect(screen.getAllByText("Script Experts").length).toBeGreaterThan(0);
    expect(screen.getByText("unverified")).toBeInTheDocument();
    expect(await screen.findByText("Identity reviewed")).toBeInTheDocument();
  });

  it("requires reason for rejected or suspended transitions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => jsonResponse({ entries: [{ provider, latestReview: null }] })));

    renderPage();

    await screen.findAllByText("Script Experts");
    await user.selectOptions(screen.getByLabelText("Verification state"), "rejected");
    await user.click(screen.getByRole("button", { name: "Update verification" }));

    expect(await screen.findByText("Reason is required for rejected or suspended providers.")).toBeInTheDocument();
  });

  it("updates verification and invalidates queue after mutation", async () => {
    const user = userEvent.setup();
    let queueGets = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("review-queue") && method === "GET") {
        queueGets++;
        return jsonResponse({ entries: [{ provider, latestReview: null }] });
      }
      if (url.includes("/verification") && method === "GET") {
        return jsonResponse({ events: [] });
      }
      return jsonResponse({ provider: { ...provider, verificationState: "verified" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    await screen.findAllByText("Script Experts");
    const beforeMutation = queueGets;
    await user.selectOptions(screen.getByLabelText("Verification state"), "verified");
    await user.type(screen.getByLabelText("Reason"), "Identity reviewed");
    await user.click(screen.getByRole("button", { name: "Update verification" }));

    await waitFor(() => expect(queueGets).toBeGreaterThan(beforeMutation));
    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/verification") && call[1]?.method === "PATCH");
    expect(patchCall?.[1]?.method).toBe("PATCH");
  });
});
