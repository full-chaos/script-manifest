import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/toast";
import CoverageMarketplacePage from "./page";

function renderPage() {
  return render(
    <ToastProvider>
      <CoverageMarketplacePage />
    </ToastProvider>
  );
}

function makeServicesResponse(services: unknown[] = []) {
  return new Response(JSON.stringify({ services }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function makeProvidersResponse(providers: unknown[] = []) {
  return new Response(JSON.stringify({ providers }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("CoverageMarketplacePage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders hero section with heading and description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => makeServicesResponse())
    );

    renderPage();

    expect(await screen.findByText("Professional script coverage")).toBeInTheDocument();
    expect(screen.getByText("Coverage Marketplace")).toBeInTheDocument();
  });

  it("renders filter controls for tier and price", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => makeServicesResponse())
    );

    renderPage();

    await screen.findByText("Professional script coverage");

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("500")).toBeInTheDocument();
  });

  it("shows empty state when no services are found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("providers")) return makeProvidersResponse();
        return makeServicesResponse([]);
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No services found")).toBeInTheDocument();
    });
  });

  it("renders provider service cards with title and pricing", async () => {
    const service = {
      id: "svc_01",
      title: "Full Feature Coverage",
      description: "Comprehensive notes on your feature.",
      tier: "early_draft" as const,
      priceCents: 14900,
      turnaroundDays: 5,
      maxPages: 120,
      providerId: "prov_01",
      createdAt: new Date().toISOString(),
      active: true
    };

    const provider = {
      id: "prov_01",
      displayName: "Script Experts",
      bio: "Professional coverage since 2010",
      createdAt: new Date().toISOString()
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("providers")) return makeProvidersResponse([provider]);
        return makeServicesResponse([service]);
      })
    );

    renderPage();

    expect(await screen.findByText("Full Feature Coverage")).toBeInTheDocument();
    expect(screen.getByText("$149.00")).toBeInTheDocument();
    expect(screen.getByText("5d turnaround")).toBeInTheDocument();
    expect(screen.getByText("Script Experts")).toBeInTheDocument();
  });

  it("shows 'Unknown Provider' when provider is not found for a service", async () => {
    const service = {
      id: "svc_02",
      title: "Mystery Coverage",
      description: null,
      tier: "concept_notes" as const,
      priceCents: 4900,
      turnaroundDays: 3,
      maxPages: 60,
      providerId: "prov_unknown",
      createdAt: new Date().toISOString(),
      active: true
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("providers")) return makeProvidersResponse([]);
        return makeServicesResponse([service]);
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Unknown Provider")).toBeInTheDocument();
    });
  });
});
