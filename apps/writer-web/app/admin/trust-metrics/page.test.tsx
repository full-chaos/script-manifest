import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ToastProvider } from "../../components/toast";
import { fetcher } from "../../lib/fetcher";
import TrustMetricsAdminPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const adminMetricsPayload = {
  metrics: {
    snapshotAt: "2026-05-24T12:00:00.000Z",
    scriptsHostedTotal: 12,
    placementsRecordedTotal: 8,
    placementsVerifiedTotal: 5,
    competitionsTrackedTotal: 7,
    exportsGeneratedTotal: 3,
    verifiedIndustryDownloadsTotal: 4,
    writersExportablePct: 100,
    sourceDataStamps: {
      scriptsMaxUpdatedAt: "2026-05-24T11:00:00.000Z",
      placementsMaxUpdatedAt: "2026-05-24T11:05:00.000Z",
      competitionsMaxSavedAt: "2026-05-24T11:10:00.000Z",
      exportsMaxGeneratedAt: "2026-05-24T11:15:00.000Z",
      downloadsMaxDownloadedAt: "2026-05-24T11:20:00.000Z",
      writersMaxUpdatedAt: null
    }
  },
  refresh: {
    refreshedAt: "2026-05-24T12:01:00.000Z",
    cacheTtlSeconds: 60,
    warnings: [{ metric: "exportsGeneratedTotal", reason: "No generated exports yet" }]
  }
};

function renderPage() {
  return render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <ToastProvider>
        <TrustMetricsAdminPage />
      </ToastProvider>
    </SWRConfig>
  );
}

describe("TrustMetricsAdminPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders metrics, source stamps, and warnings", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => jsonResponse(adminMetricsPayload)));

    renderPage();

    expect(await screen.findByText("Trust Metrics")).toBeInTheDocument();
    expect(screen.getByText("Hosted public scripts")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Source stamps")).toBeInTheDocument();
    expect(screen.getByText("scriptsMaxUpdatedAt")).toBeInTheDocument();
    expect(screen.getByText("No generated exports yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh snapshot/i })).toBeInTheDocument();
  });

  it("triggers manual refresh and revalidates", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        return jsonResponse(adminMetricsPayload);
      }
      getCallCount++;
      return jsonResponse(adminMetricsPayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await screen.findByText("Source stamps");
    const before = getCallCount;
    await user.click(screen.getByRole("button", { name: /refresh snapshot/i }));

    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(before);
    });
  });

  it("surfaces forbidden errors for non-admin users", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => jsonResponse({ message: "Forbidden" }, 403)));

    renderPage();

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
  });
});
