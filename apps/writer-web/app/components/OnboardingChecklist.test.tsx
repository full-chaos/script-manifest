import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { mockUseAuth } from "../../vitest.setup";
import { OnboardingChecklist } from "./OnboardingChecklist";

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

  it("renders 5 checklist items from server status", async () => {
    mockFetchStatus({
      emailVerified: false,
      profileCompleted: false,
      firstScriptUploaded: false,
      competitionsVisited: false,
      coverageVisited: false,
    });

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    expect(screen.getByText("Verify email")).toBeInTheDocument();
    expect(screen.getByText("Complete your profile")).toBeInTheDocument();
    expect(screen.getByText("Upload your first script")).toBeInTheDocument();
    expect(screen.getByText("Browse competitions")).toBeInTheDocument();
    expect(screen.getByText("Explore coverage services")).toBeInTheDocument();
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
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissButtons[0] as HTMLElement);

    expect(window.localStorage.getItem("onboarding-dismissed")).toBe("true");
    expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
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

    expect(screen.getByTestId("check-complete-profile")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-upload-script")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-browse-competitions")).toBeInTheDocument();
    expect(screen.getByTestId("uncheck-explore-coverage")).toBeInTheDocument();
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

    expect(screen.getByTestId("check-complete-profile")).toBeInTheDocument();
    expect(screen.getByTestId("check-upload-script")).toBeInTheDocument();
    expect(screen.getByTestId("check-browse-competitions")).toBeInTheDocument();
    expect(screen.getByTestId("check-explore-coverage")).toBeInTheDocument();
  });

  it("still renders with all-false when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    render(<OnboardingChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
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
