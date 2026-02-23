import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MethodologyPage from "./page";

const SAMPLE_METHODOLOGY = {
  version: "1.0",
  statusWeights: {
    winner: 1.0,
    finalist: 0.75,
    semifinalist: 0.5,
    quarterfinalist: 0.25,
    selected: 0.1
  },
  prestigeMultipliers: {
    tier_1: 3.0,
    tier_2: 2.0,
    tier_3: 1.5,
    tier_4: 1.0
  },
  timeDecayHalfLifeDays: 365,
  confidenceThreshold: 5,
  tierThresholds: {
    top_5_pct: 0.05,
    top_25_pct: 0.25,
    top_50_pct: 0.5
  }
};

describe("MethodologyPage", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the hero section with heading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify(SAMPLE_METHODOLOGY), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    render(<MethodologyPage />);

    expect(screen.getByText("Scoring Methodology")).toBeInTheDocument();
    expect(screen.getByText("Rankings")).toBeInTheDocument();
  });

  it("renders loading state before data arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise(() => {}))
    );

    render(<MethodologyPage />);

    expect(screen.getByText("Loading methodology...")).toBeInTheDocument();
  });

  it("renders the algorithm version and status weights after loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify(SAMPLE_METHODOLOGY), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    render(<MethodologyPage />);

    await waitFor(() => {
      expect(screen.getByText("Algorithm v1.0")).toBeInTheDocument();
    });

    expect(screen.getByText("Status Weights")).toBeInTheDocument();
    expect(screen.getByText("winner")).toBeInTheDocument();
    expect(screen.getByText("finalist")).toBeInTheDocument();
  });

  it("renders prestige multipliers and time decay info", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify(SAMPLE_METHODOLOGY), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    render(<MethodologyPage />);

    await waitFor(() => {
      expect(screen.getByText("Prestige Multipliers")).toBeInTheDocument();
    });

    expect(screen.getByText("Time Decay & Confidence")).toBeInTheDocument();
    expect(screen.getByText("365 days")).toBeInTheDocument();
    expect(screen.getByText("5 evaluations")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(null, { status: 500 })
      )
    );

    render(<MethodologyPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load methodology.")).toBeInTheDocument();
    });
  });
});
