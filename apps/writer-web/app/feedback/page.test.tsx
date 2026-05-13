import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { mockUseAuth } from "../../vitest.setup";
import { ToastProvider } from "../components/toast";
import * as toastModule from "../components/toast";
import { fetcher } from "../lib/fetcher";
import FeedbackPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SWRConfig
      value={{
        fetcher,
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      <ToastProvider>{ui}</ToastProvider>
    </SWRConfig>
  );
}

const baseUser = {
  id: "writer_01",
  email: "writer@example.com",
  displayName: "Writer One",
  role: "writer",
  emailVerified: true,
};

const sampleListing = {
  id: "listing_1",
  ownerUserId: "writer_02",
  projectId: "project_1",
  scriptId: "script_1",
  title: "My Thriller Script",
  description: "Looking for notes on tension",
  genre: "thriller",
  format: "feature",
  pageCount: 105,
  status: "open",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  reviewDeadline: null,
  createdAt: "2026-02-06T00:00:00.000Z",
  updatedAt: "2026-02-06T00:00:00.000Z",
};

describe("FeedbackPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not fetch auth-paused endpoints and shows sign-in badge when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      // Allow public listings fetch
      if (url.includes("/api/v1/feedback/listings?status=open")) {
        return jsonResponse({ listings: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<FeedbackPage />);

    expect(screen.getByText("Sign in for tokens")).toBeInTheDocument();
    // auth-paused keys (balance, myListings, projects, reviews) must not fire
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feedback/tokens/balance"),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("ownerUserId="),
      expect.anything()
    );
  });

  it("renders the hero section and tab navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("feedback/listings?status=open")) return jsonResponse({ listings: [] });
        if (url.includes("feedback/tokens/balance")) return jsonResponse({ balance: 3 });
        if (url.includes("feedback/tokens/grant-signup")) return jsonResponse({});
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
        if (url.includes("feedback/reviews?")) return jsonResponse({ reviews: [] });
        if (url.includes("feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<FeedbackPage />);

    expect(await screen.findByText("Give feedback, get feedback")).toBeInTheDocument();
    expect(screen.getByText("Feedback Exchange")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Available" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Listings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "My Reviews" })).toBeInTheDocument();
  });

  it("shows available listings after load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("feedback/listings?status=open")) return jsonResponse({ listings: [sampleListing] });
        if (url.includes("feedback/tokens/balance")) return jsonResponse({ balance: 2 });
        if (url.includes("feedback/tokens/grant-signup")) return jsonResponse({});
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
        if (url.includes("feedback/reviews?")) return jsonResponse({ reviews: [] });
        if (url.includes("feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<FeedbackPage />);

    await screen.findByText("My Thriller Script");
    expect(screen.getByText("2 tokens available")).toBeInTheDocument();
  });

  it("surfaces ApiError via toast when listings endpoint returns 500", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("feedback/listings?status=open")) {
          return new Response(JSON.stringify({ message: "Listings service down" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("feedback/tokens/balance")) return jsonResponse({ balance: 1 });
        if (url.includes("feedback/tokens/grant-signup")) return jsonResponse({});
        if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
        if (url.includes("feedback/reviews?")) return jsonResponse({ reviews: [] });
        if (url.includes("feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
        return jsonResponse({});
      })
    );

    renderWithProviders(<FeedbackPage />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Listings service down");
    });
  });

  it("shows 'My Listings' tab sign-in guard when switching tabs with no user", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("feedback/listings?status=open")) return jsonResponse({ listings: [] });
        return jsonResponse({});
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    // Switch to My Listings tab
    const myListingsTab = await screen.findByRole("button", { name: "My Listings" });
    await user.click(myListingsTab);

    expect(screen.getByText("Sign in to see your listings")).toBeInTheDocument();
  });
});
