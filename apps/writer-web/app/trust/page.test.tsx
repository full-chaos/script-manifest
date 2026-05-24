import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { serverFetch } from "../lib/serverFetch";
import TrustPage, { generateMetadata } from "./page";

vi.mock("../lib/serverFetch", () => ({
  serverFetch: vi.fn()
}));

const serverFetchMock = vi.mocked(serverFetch);

const response = {
  metrics: {
    snapshotAt: "2026-05-24T12:00:00.000Z",
    scriptsHostedTotal: 1234,
    placementsRecordedTotal: 98,
    placementsVerifiedTotal: 56,
    competitionsTrackedTotal: 41,
    exportsGeneratedTotal: 17,
    verifiedIndustryDownloadsTotal: 29,
    writersExportablePct: 100
  }
};

async function renderPage() {
  const element = await TrustPage();
  return render(element);
}

describe("TrustPage", () => {
  beforeEach(() => {
    serverFetchMock.mockReset();
    serverFetchMock.mockResolvedValue(response);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders SEO metadata for public previews", async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toContain("Trust proof");
    expect(metadata.description).toContain("aggregate trust metrics");
    expect(metadata.openGraph?.title).toContain("Trust proof");
  });

  it("fetches public trust metrics with five-minute revalidation", async () => {
    await renderPage();

    expect(serverFetchMock).toHaveBeenCalledWith("/api/v1/trust-proof-metrics", {
      next: { revalidate: 300 }
    });
  });

  it("renders accessible labeled counters and last refreshed copy", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: /proof the marketplace is earning trust/i })).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("Hosted public scripts")).toBeInTheDocument();
    expect(screen.getByText("Verified placements")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /aggregate-only, source-backed counters/i })).toBeInTheDocument();
  });
});
