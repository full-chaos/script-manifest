import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignInPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("SignInPage", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("registers a user and stores the auth session", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          token: "sess_1",
          expiresAt: "2026-02-13T00:00:00.000Z",
          user: {
            id: "user_1",
            email: "writer@example.com",
            displayName: "Writer One"
          }
        },
        201
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SignInPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.type(screen.getByLabelText("Display name"), "Writer One");
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await screen.findByText(/Signed in as/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({ method: "POST" })
    );

    const stored = window.localStorage.getItem("script_manifest_session");
    expect(stored).toContain("sess_1");
  });

  it("shows error state when login fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "invalid_credentials" }, 401)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SignInPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Error: invalid_credentials")).toBeInTheDocument();
    });
  });

  it("supports mocked GitHub OAuth flow", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/v1/auth/oauth/github/start") {
        return jsonResponse(
          {
            provider: "github",
            state: "state_1234567890123456",
            callbackUrl: "http://localhost:4005/internal/auth/oauth/github/callback",
            authorizationUrl:
              "http://localhost:4005/internal/auth/oauth/github/callback?state=state_1234567890123456&code=code_1234567890123456",
            mockCode: "code_1234567890123456",
            expiresAt: "2026-02-13T00:00:00.000Z"
          },
          201
        );
      }

      if (url.startsWith("/api/v1/auth/oauth/github/callback?")) {
        return jsonResponse({
          token: "oauth_sess_1",
          expiresAt: "2026-02-13T00:00:00.000Z",
          user: {
            id: "user_oauth",
            email: "github+writer@oauth.local",
            displayName: "Writer (github)"
          }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SignInPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    await screen.findByText(/Signed in as/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/oauth/github/start",
      expect.objectContaining({ method: "POST" })
    );
    expect(window.localStorage.getItem("script_manifest_session")).toContain("oauth_sess_1");
  });
});
