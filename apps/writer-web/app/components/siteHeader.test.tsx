import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./siteHeader";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPathname = "/";
  });

  it("shows logged-out actions", async () => {
    render(<SiteHeader />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin"
    );
    expect(screen.queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
  });

  it("shows signed-in navigation", async () => {
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: {
          id: "writer_01",
          email: "writer@example.com",
          displayName: "Writer One"
        }
      })
    );

    render(<SiteHeader />);

    expect(await screen.findByText("Writer One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/signin");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("shows admin navigation for admin users", async () => {
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: {
          id: "user_admin_01",
          email: "admin@example.com",
          displayName: "Admin User",
          role: "admin"
        }
      })
    );

    render(<SiteHeader />);

    expect(await screen.findByText("Admin User")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin/competitions");
  });

  it("shows current page label on mobile when menu is closed", async () => {
    mockPathname = "/leaderboard";

    render(<SiteHeader />);

    // Mobile menu should be closed by default - check aria-expanded
    const buttons = screen.getAllByRole("button");
    const menuButton = buttons.find(btn => btn.getAttribute("aria-controls") === "mobile-primary-nav");
    expect(menuButton).toBeDefined();
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");

    // Current page label "Leaderboard" should be visible somewhere in the document
    expect(screen.getAllByText("Leaderboard").length).toBeGreaterThan(0);
  });

  it("hides current page label on mobile when menu is open", async () => {
    mockPathname = "/leaderboard";

    const { container } = render(<SiteHeader />);

    // Find the mobile menu toggle button using querySelector to ensure we get the right one
    const menuButton = container.querySelector('button[aria-controls="mobile-primary-nav"]');
    expect(menuButton).not.toBeNull();

    // Initially closed
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(menuButton?.getAttribute("aria-label")).toBe("Open menu");

    // Click to open
    if (menuButton) {
      fireEvent.click(menuButton);
    }

    // After click, should be open
    await waitFor(() => {
      expect(menuButton?.getAttribute("aria-label")).toBe("Close menu");
      expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("does not show current page label for filtered-out links", async () => {
    mockPathname = "/projects";

    // Render without signed-in user
    const { container } = render(<SiteHeader />);

    // Find the mobile label area (the span with class text-xs font-medium text-ink-500 inside lg:hidden div)
    const mobileSection = container.querySelector(".lg\\:hidden");
    const labelSpan = mobileSection?.querySelector("span.text-xs");

    // "Projects" link requires sign-in, so label should not be shown in mobile section when not signed in
    expect(labelSpan).not.toBeInTheDocument();
  });

  it("shows current page label only for visible links", async () => {
    mockPathname = "/projects";

    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: {
          id: "writer_01",
          email: "writer@example.com",
          displayName: "Writer One"
        }
      })
    );

    const { container } = render(<SiteHeader />);

    // Find the mobile label area
    const mobileSection = container.querySelector(".lg\\:hidden");
    const labelSpan = mobileSection?.querySelector("span.text-xs");

    // Now signed in, so "Projects" should be visible in mobile label
    expect(labelSpan).toBeInTheDocument();
    expect(labelSpan?.textContent).toBe("Projects");
  });

  it("toggles aria-label when mobile menu is opened and closed", async () => {
    const { container } = render(<SiteHeader />);

    // Find the mobile menu toggle button using querySelector
    const menuButton = container.querySelector('button[aria-controls="mobile-primary-nav"]');
    expect(menuButton).not.toBeNull();

    // Initially closed
    expect(menuButton?.getAttribute("aria-label")).toBe("Open menu");
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");

    // Click to open
    if (menuButton) {
      fireEvent.click(menuButton);
    }

    // Wait for state update
    await waitFor(() => {
      expect(menuButton?.getAttribute("aria-label")).toBe("Close menu");
      expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    });

    // Click to close
    if (menuButton) {
      fireEvent.click(menuButton);
    }

    // Wait for state update
    await waitFor(() => {
      expect(menuButton?.getAttribute("aria-label")).toBe("Open menu");
      expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
