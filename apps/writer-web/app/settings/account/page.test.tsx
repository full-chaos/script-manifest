import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockUseAuth } from "../../../vitest.setup";
import AccountSettingsPage from "./page";

describe("AccountSettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    globalThis.fetch = vi.fn();
  });

  it("shows sign-in prompt without active session", () => {
    render(<AccountSettingsPage />);

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });
});
