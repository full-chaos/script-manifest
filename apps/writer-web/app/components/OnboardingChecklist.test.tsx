import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { writeStoredSession, clearStoredSession } from "../lib/authSession";

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearStoredSession();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    clearStoredSession();
    vi.restoreAllMocks();
  });

  it("renders 5 checklist items when localStorage key not set", () => {
    render(<OnboardingChecklist />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
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

  it("dismiss button sets localStorage and removes component from DOM", () => {
    render(<OnboardingChecklist />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    
    const dismissButtons = screen.getAllByRole("button", { name: /dismiss/i });
    fireEvent.click(dismissButtons[0] as HTMLElement);
    
    expect(window.localStorage.getItem("onboarding-dismissed")).toBe("true");
    expect(screen.queryByText("Getting Started")).not.toBeInTheDocument();
  });

  it("email verified item shows checkmark when session has emailVerified = true", () => {
    writeStoredSession({
      token: "fake-token",
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      user: {
        id: "123",
        email: "test@example.com",
        displayName: "Test",
        role: "writer",
        emailVerified: true
      }
    } as Parameters<typeof writeStoredSession>[0]);

    render(<OnboardingChecklist />);
    
    const verifyItem = screen.getByTestId("check-verify-email");
    expect(verifyItem).toBeInTheDocument();
  });
});
