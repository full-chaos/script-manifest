import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockUseAuth } from "../../vitest.setup";
import VerifyEmailPage from "./page";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace })
}));

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockReplace.mockReset();
    globalThis.fetch = vi.fn();
  });

  it("shows sign-in prompt when session is missing", () => {
    render(<VerifyEmailPage />);

    expect(screen.getByText("Verify your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });
});
