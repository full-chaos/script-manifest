import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockUseAuth } from "../vitest.setup";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    cleanup();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
  });

  it("shows a logged-out landing page by default", async () => {
    render(<HomePage />);

    expect(
      await screen.findByText(
        "Your screenwriting career record should not disappear."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start your record" })).toHaveAttribute(
      "href",
      "/signin"
    );
  });

  it("shows quick actions when a session exists", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "writer_01",
        email: "writer@example.com",
        displayName: "Writer One",
        role: "writer",
        emailVerified: true
      },
      loading: false
    });

    render(<HomePage />);

    expect(await screen.findByText("Career record path")).toBeInTheDocument();
    expect(screen.getByText("Writer One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open My Work" })).toHaveAttribute(
      "href",
      "/projects"
    );
  });
});
