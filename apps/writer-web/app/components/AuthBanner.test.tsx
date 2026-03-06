import { renderToString } from "react-dom/server";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import { AuthBanner } from "./AuthBanner";
import { SESSION_CHANGED_EVENT, SESSION_STORAGE_KEY } from "../lib/authSession";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});


const writerSurfaces = [
  {
    title: "Profile",
    description: "Create a profile",
    href: "/profile" as Route,
    iconKey: "profile" as const
  }
];

const trustPrinciples = ["No script leaves your control."];

describe("AuthBanner", () => {
  it("renders null during server render before hydration", () => {
    const html = renderToString(
      <AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />
    );

    expect(html).toBe("");
  });

  it("renders unauthenticated hero when no session is stored", async () => {
    window.localStorage.clear();

    render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);

    expect(await screen.findByText("Writer Hub")).toBeInTheDocument();
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("renders authenticated welcome after reading localStorage", async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token",
        expiresAt: "2030-01-01T00:00:00.000Z",
        user: {
          id: "u-1",
          email: "writer@example.com",
          displayName: "Writer One"
        }
      })
    );

    render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);

    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Writer One")).toBeInTheDocument();
  });

  it("reacts to session changed events", async () => {
    window.localStorage.clear();
    render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);
    await screen.findByText("Writer Hub");

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "token-2",
        expiresAt: "2030-01-01T00:00:00.000Z",
        user: {
          id: "u-2",
          email: "writer2@example.com",
          displayName: "Writer Two"
        }
      })
    );

    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT));

    await waitFor(() => {
      expect(screen.getByText("Writer Two")).toBeInTheDocument();
    });
  });
});
