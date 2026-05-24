import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import type { WriterProfile, ResumeMetricsResponse } from "@script-manifest/contracts";
import { ResumeMetricsWidget } from "./ResumeMetricsWidget";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}

function makeProfile(overrides: Partial<WriterProfile> = {}): WriterProfile {
  return {
    id: "writer_test",
    displayName: "Test Writer",
    bio: "",
    genres: [],
    demographics: [],
    representationStatus: "unrepresented",
    headshotUrl: "",
    customProfileUrl: "",
    isSearchable: true,
    ...overrides,
  };
}

function mockFetchResume(metrics: ResumeMetricsResponse | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (metrics === null) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, json: async () => ({ metrics }) } as Response;
  });
}

describe("ResumeMetricsWidget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders zero fallbacks when SWR has no data yet", () => {
    mockFetchResume(null);
    render(<ResumeMetricsWidget profile={makeProfile()} />, { wrapper: Wrapper });

    // All four metrics fall back to 0 via the `?? 0` branches before fetch resolves.
    expect(screen.getByText("0 views · 7d")).toBeInTheDocument();
    expect(screen.getByText("0 views · 30d")).toBeInTheDocument();
    expect(screen.getByText("0 script downloads")).toBeInTheDocument();
    expect(screen.getByText("0 verified placements")).toBeInTheDocument();
  });

  it("renders real metrics once SWR resolves", async () => {
    mockFetchResume({
      writerId: "writer_test",
      totalViews7d: 12,
      totalViews30d: 47,
      totalScriptDownloads: 3,
      verifiedPlacementsCount: 1,
      projectsCount: 5,
    });

    render(<ResumeMetricsWidget profile={makeProfile()} />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("12 views · 7d")).toBeInTheDocument();
    });

    expect(screen.getByText("47 views · 30d")).toBeInTheDocument();
    expect(screen.getByText("3 script downloads")).toBeInTheDocument();
    expect(screen.getByText("1 verified placements")).toBeInTheDocument();
  });

  it("falls back to profile.id when customProfileUrl is empty", () => {
    mockFetchResume(null);
    render(
      <ResumeMetricsWidget profile={makeProfile({ id: "writer_42", customProfileUrl: "" })} />,
      { wrapper: Wrapper },
    );

    const link = screen.getByRole("link", { name: /open resume/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/writers/writer_42");
  });

  it("uses customProfileUrl as a relative handle when it is not a full URL", () => {
    mockFetchResume(null);
    render(
      <ResumeMetricsWidget
        profile={makeProfile({ id: "writer_42", customProfileUrl: "favorite-writer" })}
      />,
      { wrapper: Wrapper },
    );

    const link = screen.getByRole("link", { name: /open resume/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/writers/favorite-writer");
  });

  it("uses customProfileUrl verbatim when it is a full http URL", () => {
    mockFetchResume(null);
    render(
      <ResumeMetricsWidget
        profile={makeProfile({ customProfileUrl: "https://example.com/me" })}
      />,
      { wrapper: Wrapper },
    );

    const link = screen.getByRole("link", { name: /open resume/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.com/me");
  });

  it("copies a relative share link with origin prepended on click", async () => {
    mockFetchResume(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <ResumeMetricsWidget profile={makeProfile({ id: "writer_99", customProfileUrl: "" })} />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    expect(writeText.mock.calls[0]?.[0]).toBe(`${window.location.origin}/writers/writer_99`);
  });

  it("copies the absolute share link verbatim when customProfileUrl is a full URL", async () => {
    mockFetchResume(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <ResumeMetricsWidget
        profile={makeProfile({ customProfileUrl: "https://example.com/me" })}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    expect(writeText.mock.calls[0]?.[0]).toBe("https://example.com/me");
  });
});
