import { cleanup, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockUseAuth } from "../../vitest.setup";
import { AuthBanner } from "./AuthBanner";

afterEach(() => {
  cleanup();
  mockUseAuth.mockReset();
});

const writerSurfaces = [
  {
    title: "Profile",
    description: "Create a profile",
    href: "/profile" as Route,
    iconKey: "profile" as const,
  },
];

const trustPrinciples = ["No script leaves your control."];

describe("AuthBanner", () => {
  it("renders unauthenticated hero when no user exists", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);

    expect(screen.getByText("Writer Hub")).toBeInTheDocument();
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("renders authenticated welcome when user exists", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u-1",
        email: "writer@example.com",
        displayName: "Writer One",
        role: "writer",
        emailVerified: true
      },
      loading: false
    });

    render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Writer One")).toBeInTheDocument();
  });
});
