import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountSettingsPage from "./page";

describe("AccountSettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it("shows sign-in prompt without active session", () => {
    render(<AccountSettingsPage />);

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });
});
