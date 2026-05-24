import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/fetcher";
import { serverFetch } from "../lib/serverFetch";
import { CoverageFilters } from "./filters";
import CoverageMarketplacePage from "./page";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../lib/serverFetch", () => ({
  serverFetch: vi.fn(),
}));

const serverFetchMock = vi.mocked(serverFetch);

const service = {
  id: "svc_01",
  title: "Full Feature Coverage",
  description: "Comprehensive notes on your feature.",
  tier: "early_draft" as const,
  priceCents: 14900,
  turnaroundDays: 5,
  maxPages: 120,
  providerId: "prov_01",
  createdAt: "2026-01-01T00:00:00.000Z",
  active: true,
};

const provider = {
  id: "prov_01",
  userId: "user_01",
  displayName: "Script Experts",
  bio: "Professional coverage since 2010",
  specialties: ["Drama"],
  status: "active" as const,
  stripeAccountId: "acct_1",
  stripeOnboardingComplete: true,
  verificationState: "verified" as const,
  verifiedAt: "2026-05-24T12:00:00.000Z",
  verifiedByUserId: "admin_01",
  verificationNotes: "Identity reviewed",
  verificationUpdatedAt: "2026-05-24T12:00:00.000Z",
  badge: {
    kind: "verified_provider" as const,
    label: "Verified provider",
    description: "Script Manifest reviewed this provider's identity and coverage history.",
    verifiedAt: "2026-05-24T12:00:00.000Z"
  },
  avgRating: null,
  totalOrdersCompleted: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function renderPage(params: Record<string, string | string[] | undefined> = {}) {
  const element = await CoverageMarketplacePage({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe("CoverageMarketplacePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    serverFetchMock.mockReset();
    pushMock.mockClear();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })));
    serverFetchMock
      .mockResolvedValueOnce({ services: [] })
      .mockResolvedValueOnce({ providers: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders hero section with heading and description", async () => {
    await renderPage();

    expect(screen.getByText("Professional script coverage")).toBeInTheDocument();
    expect(screen.getByText("Coverage Marketplace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Coverage SLA" })).toHaveAttribute("href", "/policies/coverage-sla");
    expect(screen.getByRole("link", { name: "Dispute policy" })).toHaveAttribute("href", "/policies/dispute-refund");
    expect(screen.getByRole("link", { name: "Refund policy" })).toHaveAttribute("href", "/policies/dispute-refund");
  });

  it("renders filter controls for tier and price", async () => {
    await renderPage();

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("500")).toBeInTheDocument();
  });

  it("sends URL filter values to serverFetch as coverage service cents", async () => {
    await renderPage({ tier: "early_draft", minPrice: "10", maxPrice: "250" });

    const [firstCallPath, firstCallInit] = serverFetchMock.mock.calls[0]!;
    expect(firstCallPath).toBe("/api/v1/coverage/services");
    const sentParams = firstCallInit?.searchParams as URLSearchParams;
    expect(sentParams.toString()).toBe(
      new URLSearchParams({ tier: "early_draft", minPrice: "1000", maxPrice: "25000" }).toString(),
    );
    expect(serverFetchMock.mock.calls[1]?.[0]).toBe("/api/v1/coverage/providers");
  });

  it("shows empty state when no services are found", async () => {
    await renderPage();

    expect(screen.getByText("No services found")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your filters or check back later.")).toBeInTheDocument();
  });

  it("renders provider service cards with title and pricing", async () => {
    serverFetchMock.mockReset();
    serverFetchMock
      .mockResolvedValueOnce({ services: [service] })
      .mockResolvedValueOnce({ providers: [provider] });

    await renderPage();

    expect(screen.getByText("Full Feature Coverage")).toBeInTheDocument();
    expect(screen.getByText("$149.00")).toBeInTheDocument();
    expect(screen.getByText("5d turnaround")).toBeInTheDocument();
    expect(screen.getByText("Script Experts")).toBeInTheDocument();
    expect(screen.getByText("Verified provider")).toBeInTheDocument();
  });

  it("shows 'Unknown Provider' when provider is not found for a service", async () => {
    serverFetchMock.mockReset();
    serverFetchMock
      .mockResolvedValueOnce({ services: [{ ...service, id: "svc_02", providerId: "prov_unknown" }] })
      .mockResolvedValueOnce({ providers: [] });

    await renderPage();

    expect(screen.getByText("Unknown Provider")).toBeInTheDocument();
  });

  it("renders an inline ApiError state", async () => {
    serverFetchMock.mockReset();
    serverFetchMock.mockRejectedValueOnce(
      new ApiError("Coverage service unavailable", { status: 503 })
    );

    await renderPage();

    expect(screen.getByText("Coverage service unavailable")).toBeInTheDocument();
  });

  it("pushes updated query strings from the filter form", () => {
    render(<CoverageFilters tier="" minPrice="" maxPrice="" />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "concept_notes" } });
    expect(pushMock).toHaveBeenLastCalledWith("/coverage?tier=concept_notes");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "25" } });
    expect(pushMock).toHaveBeenLastCalledWith("/coverage?tier=concept_notes&minPrice=25");

    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "100" } });
    expect(pushMock).toHaveBeenLastCalledWith(
      "/coverage?tier=concept_notes&minPrice=25&maxPrice=100"
    );
  });
});
