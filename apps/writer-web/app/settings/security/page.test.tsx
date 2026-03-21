import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecuritySettingsPage from "./page";

describe("SecuritySettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it("shows sign-in prompt without active session", () => {
    render(<SecuritySettingsPage />);

    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in" })).toHaveAttribute("href", "/signin");
  });
});
