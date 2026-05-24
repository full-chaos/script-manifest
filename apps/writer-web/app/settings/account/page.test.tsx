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

  it("makes export, portability, and deletion controls discoverable to signed-in writers", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One", role: "writer" },
      loading: false,
    });

    render(<AccountSettingsPage />);

    expect(screen.getByText("Data Rights & Portability")).toBeInTheDocument();
    expect(screen.getByText(/download CSV or ZIP copies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export your data" })).toHaveAttribute("href", "/profile#data-export");
    expect(screen.getByRole("link", { name: "Import recovered history" })).toHaveAttribute("href", "/profile/import");
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });
});
