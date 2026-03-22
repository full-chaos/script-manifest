import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockRefreshAuth, mockUseAuth } from "../../vitest.setup";
import SignInPage from "./page";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("SignInPage", () => {
  beforeEach(() => {
    cleanup();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockRefreshAuth.mockReset();
    mockReplace.mockClear();
    vi.restoreAllMocks();
  });

  it("registers a user and refreshes auth context", async () => {
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

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("Display name"), "Writer One");
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("checkbox"));
    // Both the toggle and submit say "Create account" — target the submit button
    const createButtons = screen.getAllByRole("button", { name: "Create account" });
    await user.click(createButtons.find(b => (b as HTMLButtonElement).type === "submit")!);

    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/verify-email");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({ method: "POST" })
    );
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
    // Both the toggle and submit say "Sign in" — target the submit button
    const signInButtons = screen.getAllByRole("button", { name: "Sign in" });
    await user.click(signInButtons.find(b => (b as HTMLButtonElement).type === "submit")!);

    await waitFor(() => {
      expect(screen.getByText("Error: invalid_credentials")).toBeInTheDocument();
    });
  });

  it("supports mocked Google OAuth flow", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/v1/auth/oauth/google/start") {
        return jsonResponse(
          {
            provider: "google",
            state: "state_1234567890123456",
            callbackUrl: "http://localhost:4005/internal/auth/oauth/google/callback",
            authorizationUrl:
              "http://localhost:4005/internal/auth/oauth/google/callback?state=state_1234567890123456&code=code_1234567890123456",
            mockCode: "code_1234567890123456",
            expiresAt: "2026-02-13T00:00:00.000Z"
          },
          201
        );
      }

      if (url.startsWith("/api/v1/auth/oauth/google/callback?")) {
        return jsonResponse({
          token: "oauth_sess_1",
          expiresAt: "2026-02-13T00:00:00.000Z",
          user: {
            id: "user_oauth",
            email: "google+writer@oauth.local",
            displayName: "Writer (google)"
          }
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SignInPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/oauth/google/start",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("SignInPage lockout hints", () => {
  beforeEach(() => {
    cleanup();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockRefreshAuth.mockReset();
    mockReplace.mockClear();
    vi.restoreAllMocks();
  });

  async function submitLoginForm(
    user: ReturnType<typeof userEvent.setup>,
    expectedStatusPattern: RegExp = /Error: invalid_credentials/
  ) {
    const signInButtons = screen.getAllByRole("button", { name: /^Sign in$/ });
    const submitBtn = signInButtons.find(b => (b as HTMLButtonElement).type === "submit")!;
    await user.click(submitBtn);
    await screen.findByText(expectedStatusPattern, {}, { timeout: 3000 });
  }

  it("shows no hints after 2 failed logins", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401))
    ));
    render(<SignInPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await submitLoginForm(user);
    await submitLoginForm(user);
    expect(screen.queryByText(/Reset your password/)).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily locked/)).not.toBeInTheDocument();
  });

  it("shows password reset hint after 3 failed logins", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401))
    ));
    render(<SignInPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await submitLoginForm(user);
    await submitLoginForm(user);
    await submitLoginForm(user);
    expect(screen.getByText(/Reset your password/)).toBeInTheDocument();
    expect(screen.queryByText(/temporarily locked/)).not.toBeInTheDocument();
  });

  it("shows lockout hint after 5 failed logins", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401))
    ));
    render(<SignInPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await submitLoginForm(user);
    await submitLoginForm(user);
    await submitLoginForm(user);
    await submitLoginForm(user);
    await submitLoginForm(user);
    expect(screen.getByText(/Reset your password/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily locked/)).toBeInTheDocument();
  });

  it("navigates after successful login following failures", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: "invalid_credentials" }, 401)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({
        token: "sess_ok",
        expiresAt: "2026-12-31T00:00:00.000Z",
        user: { id: "u1", email: "writer@example.com", displayName: "Writer" }
      })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "writer@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await submitLoginForm(user);
    await submitLoginForm(user);
    await submitLoginForm(user);
    expect(screen.getByText(/Reset your password/)).toBeInTheDocument();

    const signInButtons = screen.getAllByRole("button", { name: /^Sign in$/ });
    const submitBtn = signInButtons.find(b => (b as HTMLButtonElement).type === "submit")!;
    await user.click(submitBtn);
    await waitFor(() => {
      expect(mockRefreshAuth).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/");
    });

    expect(mockRefreshAuth).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
