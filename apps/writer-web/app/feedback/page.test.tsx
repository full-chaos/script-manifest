import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/toast";
import FeedbackPage from "./page";

vi.mock("../lib/authSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/authSession")>();
  return {
    ...actual,
    readStoredSession: vi.fn(() => null),
    getAuthHeaders: vi.fn(() => ({}))
  };
});

function renderPage() {
  return render(
    <ToastProvider>
      <FeedbackPage />
    </ToastProvider>
  );
}

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

describe("FeedbackPage", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the hero section with heading and tagline", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "listings": { listings: [] } })
    );

    renderPage();

    expect(await screen.findByText("Give feedback, get feedback")).toBeInTheDocument();
    expect(screen.getByText("Feedback Exchange")).toBeInTheDocument();
  });

  it("shows the sign-in-for-tokens badge when no session is active", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "listings": { listings: [] } })
    );

    renderPage();

    expect(await screen.findByText("Sign in for tokens")).toBeInTheDocument();
  });

  it("renders the Available, My Listings, and My Reviews tabs", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "listings": { listings: [] } })
    );

    renderPage();

    expect(await screen.findByRole("button", { name: "Available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Listings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Reviews" })).toBeInTheDocument();
  });

  it("switches to My Listings tab and shows sign-in empty state", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "listings": { listings: [] } })
    );

    renderPage();

    // Wait for initial render
    await screen.findByRole("button", { name: "My Listings" });

    fireEvent.click(screen.getByRole("button", { name: "My Listings" }));

    await waitFor(() => {
      expect(screen.getByText("Sign in to see your listings")).toBeInTheDocument();
    });
  });

  it("renders listing cards when available listings are loaded", async () => {
    const listing = {
      id: "lst_01",
      title: "The Heist",
      description: "A clever thriller",
      genre: "thriller",
      format: "feature",
      pageCount: 95,
      ownerUserId: "other_user",
      status: "open",
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      reviewDeadline: null,
      scriptId: "script_01",
      createdAt: new Date().toISOString()
    };

    vi.stubGlobal(
      "fetch",
      mockFetch({ "listings": { listings: [listing] } })
    );

    renderPage();

    expect(await screen.findByText("The Heist")).toBeInTheDocument();
    expect(screen.getByText("A clever thriller")).toBeInTheDocument();
    expect(screen.getByText("thriller")).toBeInTheDocument();
  });
});
