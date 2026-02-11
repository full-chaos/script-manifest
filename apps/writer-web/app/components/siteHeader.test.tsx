import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./siteHeader";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

    expect(await screen.findByText("Signed in: Writer One")).toBeInTheDocument();
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

    expect(await screen.findByText("Signed in: Admin User")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin/competitions");
  });
});
