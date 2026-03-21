import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    window.history.replaceState({}, "", "/reset-password");
  });

  it("shows invalid link state without token", () => {
    render(<ResetPasswordPage />);

    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByText(/Invalid reset link/i)).toBeInTheDocument();
  });
});
