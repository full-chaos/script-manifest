import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows a logged-out landing page by default", async () => {
    render(<HomePage />);

    expect(
      await screen.findByText(
        "Build your screenwriting portfolio without losing your history again."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/signin"
    );
  });

  it("shows quick actions when a session exists", async () => {
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

    render(<HomePage />);

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Writer One")).toBeInTheDocument();
    const projectLinks = screen.getAllByRole("link", { name: "Open Projects" });
    expect(projectLinks.at(-1)).toHaveAttribute("href", "/projects");
  });
});
