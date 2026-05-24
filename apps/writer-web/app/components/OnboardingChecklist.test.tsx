import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { SWRConfig } from "swr";
import { mockUseAuth } from "../../vitest.setup";
import { OnboardingChecklist } from "./OnboardingChecklist";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: Wrapper });
}

function mockFetchStatus(status: Record<string, boolean>) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ status }),
  } as Response);
}

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user_1",
        email: "w@test.com",
        displayName: "Writer",
        role: "writer",
        emailVerified: true
      },
      loading: false
    });
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    mockUseAuth.mockReset();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the career-record activation checklist from server status", async () => {
    mockFetchStatus({
      emailVerified: false,
      profileCompleted: false,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false,
    });

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Build your portable career record")).toBeInTheDocument();
    });

    expect(screen.getByText("Create profile proof")).toBeInTheDocument();
    expect(screen.getByText("Add your first project")).toBeInTheDocument();
    expect(screen.getByText("Upload a script draft")).toBeInTheDocument();
    expect(screen.getByText("Record a submission")).toBeInTheDocument();
    expect(screen.getByText("Record a placement")).toBeInTheDocument();
    expect(screen.getByText("Export or share your record")).toBeInTheDocument();
    expect(screen.queryByText("Explore coverage services")).not.toBeInTheDocument();
  });

  it("doesn't render when localStorage onboarding-dismissed is true", () => {
    window.localStorage.setItem("onboarding-dismissed", "true");
    render(<OnboardingChecklist />);
    expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
  });

  it("dismiss button sets localStorage and removes component from DOM", async () => {
    mockFetchStatus({
      emailVerified: false,
      profileCompleted: false,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false,
    });

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Build your portable career record")).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissButtons[0] as HTMLElement);

    expect(window.localStorage.getItem("onboarding-dismissed")).toBe("true");
    expect(screen.queryByText("Build your portable career record")).not.toBeInTheDocument();
  });

  it("shows checkmarks for completed items from server", async () => {
    mockFetchStatus({
      emailVerified: true,
      profileCompleted: true,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false,
    });

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByTestId("check-verify-email")).toBeInTheDocument();
    });

    expect(screen.getByTestId("check-profile-proof")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-upload-script")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-record-submission")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-export-share")).toBeInTheDocument();
  });

  it("shows all items checked when everything is complete", async () => {
    mockFetchStatus({
      emailVerified: true,
      profileCompleted: true,
      firstScriptUploaded: true,
      competitionsVisited: true,
      coverageVisited: true,
    });

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByTestId("check-verify-email")).toBeInTheDocument();
    });

    expect(screen.getByTestId("check-profile-proof")).toBeInTheDocument();
    expect(screen.getByTestId("check-upload-script")).toBeInTheDocument();
    expect(screen.getByTestId("check-record-submission")).toBeInTheDocument();
    expect(screen.getByTestId("check-record-placement")).toBeInTheDocument();
  });

  it("still renders with all-false when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Build your portable career record")).toBeInTheDocument();
    });

    expect(screen.getByTestId("uncheck-verify-email")).toBeInTheDocument();
  });

  it("does not fetch when dismissed", () => {
    window.localStorage.setItem("onboarding-dismissed", "true");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<OnboardingChecklist />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
