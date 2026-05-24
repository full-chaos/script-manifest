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

const dayMs = 24 * 60 * 60 * 1000;

function deadlineIn(days: number) {
  return new Date(Date.now() + days * dayMs).toISOString();
}

function feedbackListing(overrides: Partial<typeof sampleListing> = {}) {
  return {
    ...sampleListing,
    ...overrides,
  };
}

const sampleReview = {
  id: "review_1",
  listingId: "listing_1",
  reviewerUserId: baseUser.id,
  status: "in_progress",
  createdAt: "2026-02-06T00:00:00.000Z",
  updatedAt: "2026-02-06T00:00:00.000Z",
};

function feedbackReview(overrides: Partial<typeof sampleReview> = {}) {
  return {
    ...sampleReview,
    ...overrides,
  };
}

const sampleProject = {
  id: "project_1",
  ownerUserId: baseUser.id,
  title: "Project One",
  genre: "drama",
  format: "feature",
  logline: null,
  synopsis: null,
  visibility: "private",
  createdAt: "2026-02-06T00:00:00.000Z",
  updatedAt: "2026-02-06T00:00:00.000Z",
};

const sampleDraft = {
  id: "draft_1",
  projectId: sampleProject.id,
  scriptId: "script_draft_1",
  versionLabel: "v2",
  pageCount: 87,
  storageKey: "scripts/script_draft_1.pdf",
  createdAt: "2026-02-06T00:00:00.000Z",
};

type FeedbackFetchOptions = {
  listings?: Array<ReturnType<typeof feedbackListing>>;
  myListings?: Array<ReturnType<typeof feedbackListing>>;
  myReviews?: Array<ReturnType<typeof feedbackReview>>;
  balance?: number | null;
  projects?: Array<typeof sampleProject>;
  drafts?: Array<typeof sampleDraft>;
  claimStatus?: number;
  claimPayload?: unknown;
  cancelStatus?: number;
  cancelPayload?: unknown;
  rateStatus?: number;
  ratePayload?: unknown;
  reviewSubmitStatus?: number;
  reviewSubmitPayload?: unknown;
  createStatus?: number;
  createPayload?: unknown;
  grantSignupStatus?: number;
  grantSignupPayload?: unknown;
};

function mockFeedbackFetch(options: FeedbackFetchOptions = {}) {
  const {
    listings = [],
    myListings = [],
    myReviews = [],
    balance = 2,
    projects = [],
    drafts = [],
    claimStatus = 200,
    claimPayload = {},
    cancelStatus = 200,
    cancelPayload = {},
    rateStatus = 200,
    ratePayload = {},
    reviewSubmitStatus = 200,
    reviewSubmitPayload = {},
    createStatus = 200,
    createPayload = { listing: feedbackListing({ id: "created_listing", ownerUserId: baseUser.id }) },
    grantSignupStatus = 200,
    grantSignupPayload = {},
  } = options;

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/v1/feedback/listings/") && url.includes("/claim")) {
      return jsonResponse(claimPayload, claimStatus);
    }

    if (url.includes("/api/v1/feedback/listings/") && url.includes("/cancel")) {
      return jsonResponse(cancelPayload, cancelStatus);
    }

    if (url.includes("/api/v1/feedback/reviews/") && url.includes("/rate")) {
      return jsonResponse(ratePayload, rateStatus);
    }

    if (url.includes("/api/v1/feedback/reviews/") && url.includes("/submit")) {
      return jsonResponse(reviewSubmitPayload, reviewSubmitStatus);
    }

    if (url.includes("/api/v1/feedback/tokens/grant-signup")) {
      return jsonResponse(grantSignupPayload, grantSignupStatus);
    }

    if (url.includes("/api/v1/feedback/tokens/balance")) {
      return jsonResponse({ balance });
    }

    if (url.includes("/api/v1/projects/") && url.includes("/drafts")) {
      return jsonResponse({ drafts });
    }

    if (url.includes("/api/v1/projects?")) {
      return jsonResponse({ projects });
    }

    if (url.includes("/api/v1/feedback/reviews?")) {
      return jsonResponse({ reviews: myReviews });
    }

    if (url.includes("/api/v1/feedback/listings?ownerUserId=")) {
      return jsonResponse({ listings: myListings });
    }

    if (url.includes("/api/v1/feedback/listings?status=open")) {
      return jsonResponse({ listings });
    }

    if (url.endsWith("/api/v1/feedback/listings") && method === "POST") {
      return jsonResponse(createPayload, createStatus);
    }

    return jsonResponse({});
  });
}

describe("FeedbackPage additional coverage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows loading skeletons before rendering the available empty state", async () => {
    let resolveListings: (response: Response) => void = () => {};
    const listingsPromise = new Promise<Response>((resolve) => {
      resolveListings = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/feedback/listings?status=open")) {
        return listingsPromise;
      }
      if (url.includes("/api/v1/feedback/tokens/balance")) return jsonResponse({ balance: 1 });
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({});
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      return jsonResponse({});
    });

    const { container } = renderWithProviders(<FeedbackPage />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);

    resolveListings(jsonResponse({ listings: [] }));

    expect(await screen.findByText("No scripts awaiting feedback")).toBeInTheDocument();
    expect(screen.getByText("1 token available")).toBeInTheDocument();
  });

  it("renders available listings across deadline states and hides claim for owned listings", async () => {
    mockFeedbackFetch({
      listings: [
        feedbackListing({ id: "expired", title: "Expired Script", expiresAt: deadlineIn(-1), description: "Late notes", pageCount: 0 }),
        feedbackListing({ id: "urgent", title: "Urgent Script", expiresAt: deadlineIn(2), description: "Need quick notes", pageCount: 12 }),
        feedbackListing({ id: "approaching", title: "Approaching Script", expiresAt: deadlineIn(10), description: "Need medium notes", pageCount: 24 }),
        feedbackListing({ id: "owned", ownerUserId: baseUser.id, title: "Owned Script", expiresAt: deadlineIn(30), description: "", pageCount: 0 }),
      ],
    });

    renderWithProviders(<FeedbackPage />);

    expect(await screen.findByText("Expired Script")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("2d left")).toBeInTheDocument();
    expect(screen.getByText("10d left")).toBeInTheDocument();
    expect(screen.getByText("30d left")).toBeInTheDocument();
    expect(screen.getByText("12 pages")).toBeInTheDocument();
    expect(screen.queryByText("0 pages")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Claim to review" })).toHaveLength(3);
  });

  it("claims an available listing and refreshes listings on success", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = mockFeedbackFetch({ listings: [feedbackListing()] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "Claim to review" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/feedback/listings/listing_1/claim"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Claimed! You have 7 days to submit your review.");
  });

  it("shows the claim ApiError message when claiming fails", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      listings: [feedbackListing()],
      claimStatus: 409,
      claimPayload: { message: "Listing already claimed" },
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "Claim to review" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Listing already claimed");
    });
  });

  it("renders my listing lifecycle statuses and cancels open listings", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = mockFeedbackFetch({
      myListings: [
        feedbackListing({ id: "open_listing", ownerUserId: baseUser.id, title: "Open Listing", status: "open" }),
        feedbackListing({ id: "claimed_listing", ownerUserId: baseUser.id, title: "Claimed Listing", status: "claimed" }),
        feedbackListing({ id: "delivered_listing", ownerUserId: baseUser.id, title: "Delivered Listing", status: "delivered" }),
        feedbackListing({ id: "disputed_listing", ownerUserId: baseUser.id, title: "Disputed Listing", status: "disputed" }),
        feedbackListing({ id: "cancelled_listing", ownerUserId: baseUser.id, title: "Cancelled Listing", status: "cancelled" }),
      ],
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Listings" }));

    expect(await screen.findByText("Open Listing")).toBeInTheDocument();
    expect(screen.getByText("claimed")).toBeInTheDocument();
    expect(screen.getByText("delivered")).toBeInTheDocument();
    expect(screen.getByText("disputed")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel & refund" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/feedback/listings/open_listing/cancel"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Listing cancelled. Your token has been refunded.");
  });

  it("shows the signed-in my listings empty state", async () => {
    mockFeedbackFetch({ myListings: [] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Listings" }));

    expect(await screen.findByText("No listings yet")).toBeInTheDocument();
    expect(screen.getByText("Create a listing above to request feedback on your script.")).toBeInTheDocument();
  });

  it("rates a completed listing when the matching review is present", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = mockFeedbackFetch({
      myListings: [feedbackListing({ id: "completed_listing", ownerUserId: baseUser.id, title: "Completed Listing", status: "completed" })],
      myReviews: [feedbackReview({ id: "review_completed", listingId: "completed_listing", status: "completed" })],
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Listings" }));
    await user.click(await screen.findByRole("button", { name: "Rate review" }));

    expect(screen.getByRole("dialog", { name: "Rate this review" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Score (1-5)"), "5");
    await user.type(screen.getByLabelText("Comment (optional)"), "Thoughtful feedback.");
    await user.click(screen.getByRole("button", { name: "Submit Rating" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/feedback/reviews/review_completed/rate"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Rating submitted. Thank you for your feedback!");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Rate this review" })).not.toBeInTheDocument();
    });
  });

  it("shows an error when a completed listing has no matching review to rate", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      myListings: [feedbackListing({ id: "completed_without_review", ownerUserId: baseUser.id, title: "Completed Without Review", status: "completed" })],
      myReviews: [],
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Listings" }));
    await user.click(await screen.findByRole("button", { name: "Rate review" }));

    expect(toastError).toHaveBeenCalledWith("Review not found for this listing.");
  });
});

async function openCreateListingForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Request feedback on a script" }));
}

async function fillManualListingFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), "Manual Script");
  await user.type(screen.getByLabelText("Genre"), "drama");
  await user.type(screen.getByLabelText("Format"), "feature");
}

async function chooseProjectDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Project"), sampleProject.id);
  await screen.findByRole("option", { name: "v2 (87 pp)" });
  await user.selectOptions(screen.getByLabelText("Draft"), sampleDraft.id);
}

function modalSubmitReviewButton() {
  const buttons = screen.getAllByRole("button", { name: "Submit Review" });
  return buttons[buttons.length - 1]!;
}

describe("FeedbackPage form, token, and review coverage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables listing creation when the signed-in writer has no tokens", async () => {
    mockFeedbackFetch({ balance: 0 });

    renderWithProviders(<FeedbackPage />);

    const disabledButton = await screen.findByRole("button", {
      name: "Not enough tokens — review scripts to earn more",
    });
    expect(disabledButton).toBeDisabled();
  });

  it("validates the no-project create path before posting a listing", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({ balance: 1, projects: [] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);

    expect(screen.getByLabelText("Upload your manuscript")).toBeInTheDocument();
    await fillManualListingFields(user);
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    expect(toastError).toHaveBeenCalledWith("Select a project and draft, or upload a manuscript file.");
  });

  it("shows draft picker empty and reset states when changing project selection", async () => {
    mockFeedbackFetch({ balance: 1, projects: [sampleProject], drafts: [] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);

    expect(screen.getByText("Or upload a new manuscript:")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload a new manuscript")).toBeInTheDocument();
    expect(screen.getByText("Select a project first")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Project"), sampleProject.id);

    expect(await screen.findByText("No drafts — upload one on the Projects page")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Project"), "");

    expect(screen.getByText("Select a project first")).toBeInTheDocument();
  });

  it("creates a listing from an existing project draft and resets the form", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = mockFeedbackFetch({ balance: 1, projects: [sampleProject], drafts: [sampleDraft] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await chooseProjectDraft(user);
    await user.type(screen.getByLabelText("Description"), "Please focus on pacing.");
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Listing created! Your script is now available for feedback.");
    });
    const createCall = fetchSpy.mock.calls.find(([input, init]) =>
      String(input).endsWith("/api/v1/feedback/listings") && init?.method === "POST"
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      projectId: sampleProject.id,
      scriptId: sampleDraft.scriptId,
      title: sampleProject.title,
      genre: sampleProject.genre,
      format: sampleProject.format,
      pageCount: sampleDraft.pageCount,
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    });
  });

  it("uses the insufficient-token create error message from ApiError bodies", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      balance: 1,
      projects: [sampleProject],
      drafts: [sampleDraft],
      createStatus: 402,
      createPayload: { message: "Payment required", error: "insufficient_tokens" },
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await chooseProjectDraft(user);
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Not enough tokens. Review others' scripts to earn more.");
    });
  });

  it("surfaces non-token create ApiError body errors", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      balance: 1,
      projects: [sampleProject],
      drafts: [sampleDraft],
      createStatus: 400,
      createPayload: { message: "Invalid listing", error: "bad_listing" },
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await chooseProjectDraft(user);
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("bad_listing");
    });
  });

  it("keeps the create form open when the create response has no listing", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      balance: 1,
      projects: [sampleProject],
      drafts: [sampleDraft],
      createPayload: {},
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await chooseProjectDraft(user);
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Description")).toBeInTheDocument();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("shows plain Error messages thrown while creating listings", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/feedback/tokens/balance")) return jsonResponse({ balance: 1 });
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({});
      if (url.includes("/api/v1/projects/") && url.includes("/drafts")) return jsonResponse({ drafts: [sampleDraft] });
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [sampleProject] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      if (url.includes("/api/v1/feedback/listings?status=open")) return jsonResponse({ listings: [] });
      if (url.endsWith("/api/v1/feedback/listings") && init?.method === "POST") {
        throw new Error("Network offline");
      }
      return jsonResponse({});
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await chooseProjectDraft(user);
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Network offline");
    });
  });

  it("uploads a new manuscript, creates project and draft records, then lists it", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/scripts/upload")) return jsonResponse({ uploaded: true, objectKey: "objects/fresh-draft.pdf" });
      if (url.includes("/api/v1/scripts/register")) return jsonResponse({ script: { scriptId: "registered_script" } });
      if (url.endsWith("/api/v1/projects") && init?.method === "POST") {
        return jsonResponse({ project: { ...sampleProject, id: "created_project", title: "Fresh Draft" } });
      }
      if (url.includes("/api/v1/projects/created_project/drafts")) return jsonResponse({ draft: { ...sampleDraft, projectId: "created_project" } });
      if (url.endsWith("/api/v1/feedback/listings") && init?.method === "POST") {
        return jsonResponse({ listing: feedbackListing({ id: "uploaded_listing", ownerUserId: baseUser.id }) });
      }
      if (url.includes("/api/v1/feedback/tokens/balance")) return jsonResponse({ balance: 1 });
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({});
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      if (url.includes("/api/v1/feedback/listings?status=open")) return jsonResponse({ listings: [] });
      return jsonResponse({});
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await fillManualListingFields(user);
    await user.type(screen.getByLabelText("Page count"), "101");
    await user.upload(screen.getByLabelText("Upload your manuscript"), new File(["fade in"], "fresh-draft.pdf", { type: "" }));
    expect(screen.getByText(/fresh-draft\.pdf/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Listing created! Your script is now available for feedback.");
    });
    const uploadCall = fetchSpy.mock.calls.find(([input]) => String(input).includes("/api/v1/scripts/upload"));
    expect((uploadCall?.[1]?.body as FormData).get("contentType")).toBe("application/octet-stream");
    const listingCall = fetchSpy.mock.calls.find(([input, init]) =>
      String(input).endsWith("/api/v1/feedback/listings") && init?.method === "POST"
    );
    expect(JSON.parse(String(listingCall?.[1]?.body))).toMatchObject({
      projectId: "created_project",
      scriptId: "registered_script",
      pageCount: 101,
    });
  });

  it("shows upload progress and upload failure details", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    let resolveUpload: (response: Response) => void = () => {};
    const uploadPromise = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/scripts/upload")) return uploadPromise;
      if (url.includes("/api/v1/feedback/tokens/balance")) return jsonResponse({ balance: 1 });
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({});
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      if (url.includes("/api/v1/feedback/listings?status=open")) return jsonResponse({ listings: [] });
      return jsonResponse({});
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await fillManualListingFields(user);
    await user.upload(screen.getByLabelText("Upload your manuscript"), new File(["bad"], "bad.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    expect(await screen.findByText("Preparing upload...")).toBeInTheDocument();

    resolveUpload(jsonResponse({ detail: "Proxy refused the upload" }, 400));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Proxy refused the upload");
    });
  });

  it("surfaces register and project creation errors during inline upload", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/scripts/upload")) return jsonResponse({ uploaded: true, objectKey: "objects/file.pdf" });
      if (url.includes("/api/v1/scripts/register")) return jsonResponse({ error: "Registration rejected" }, 400);
      if (url.includes("/api/v1/feedback/tokens/balance")) return jsonResponse({ balance: 1 });
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({});
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      if (url.includes("/api/v1/feedback/listings?status=open")) return jsonResponse({ listings: [] });
      return jsonResponse({});
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await openCreateListingForm(user);
    await fillManualListingFields(user);
    await user.upload(screen.getByLabelText("Upload your manuscript"), new File(["bad"], "bad.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "List for Feedback (1 token)" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Registration rejected");
    });
  });

  it("updates token balance after the signup grant mutation succeeds", async () => {
    let balanceCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/feedback/tokens/balance")) {
        balanceCalls += 1;
        return jsonResponse({ balance: balanceCalls === 1 ? 1 : 4 });
      }
      if (url.includes("/api/v1/feedback/tokens/grant-signup")) return jsonResponse({ granted: true });
      if (url.includes("/api/v1/projects?")) return jsonResponse({ projects: [] });
      if (url.includes("/api/v1/feedback/reviews?")) return jsonResponse({ reviews: [] });
      if (url.includes("/api/v1/feedback/listings?ownerUserId=")) return jsonResponse({ listings: [] });
      if (url.includes("/api/v1/feedback/listings?status=open")) return jsonResponse({ listings: [] });
      return jsonResponse({});
    });

    renderWithProviders(<FeedbackPage />);

    expect(await screen.findByText("4 tokens available")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/feedback/tokens/grant-signup"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps rendering when the signup token grant fails", async () => {
    const fetchSpy = mockFeedbackFetch({ balance: 1, grantSignupStatus: 500, grantSignupPayload: { message: "Grant failed" } });

    renderWithProviders(<FeedbackPage />);

    expect(await screen.findByText("Give feedback, get feedback")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request feedback on a script" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/feedback/tokens/grant-signup"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows the my reviews sign-in guard and signed-in empty state", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockFeedbackFetch({ listings: [] });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Reviews" }));
    expect(screen.getByText("Sign in to see your reviews")).toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    mockUseAuth.mockReturnValue({ user: baseUser, loading: false });
    mockFeedbackFetch({ myReviews: [] });
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Reviews" }));
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
  });

  it("submits an in-progress review from the my reviews tab", async () => {
    const toastSuccess = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: vi.fn(),
      success: toastSuccess,
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    const fetchSpy = mockFeedbackFetch({
      listings: [feedbackListing({ id: "listing_1", title: "Reviewable Script", reviewDeadline: deadlineIn(2) })],
      myReviews: [feedbackReview({ id: "review_in_progress", listingId: "listing_1", status: "in_progress" })],
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Reviews" }));
    expect(await screen.findByText("Reviewable Script")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read script" })).toHaveAttribute("href", "/projects/script_1/viewer");

    await user.click(screen.getByRole("button", { name: "Submit Review" }));
    const scores = screen.getAllByLabelText("Score (1-5)");
    const comments = screen.getAllByLabelText("Comment");
    for (const score of scores) {
      await user.type(score, "4");
    }
    for (const comment of comments) {
      await user.type(comment, "Strong execution.");
    }
    await user.type(screen.getByLabelText("Overall comment"), "Polish the ending.");
    await user.click(modalSubmitReviewButton());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/feedback/reviews/review_in_progress/submit"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Review submitted! Your token has been released.");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Submit Review" })).not.toBeInTheDocument();
    });
  });

  it("renders submitted reviews by listing id when listing details are unavailable", async () => {
    mockFeedbackFetch({
      listings: [],
      myListings: [],
      myReviews: [feedbackReview({ id: "review_missing", listingId: "missing_listing", status: "submitted" })],
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Reviews" }));

    expect(await screen.findByText("missing_listing")).toBeInTheDocument();
    expect(screen.getByText("submitted")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Read script" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit Review" })).not.toBeInTheDocument();
  });

  it("shows submit review ApiError messages", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      listings: [feedbackListing({ id: "listing_1", title: "Reviewable Script" })],
      myReviews: [feedbackReview({ id: "review_error", listingId: "listing_1", status: "in_progress" })],
      reviewSubmitStatus: 400,
      reviewSubmitPayload: { message: "Scores are incomplete" },
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Reviews" }));
    await user.click(await screen.findByRole("button", { name: "Submit Review" }));
    for (const score of screen.getAllByLabelText("Score (1-5)")) {
      await user.type(score, "3");
    }
    for (const comment of screen.getAllByLabelText("Comment")) {
      await user.type(comment, "Needs work.");
    }
    await user.click(modalSubmitReviewButton());

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Scores are incomplete");
    });
  });

  it("shows rating ApiError messages", async () => {
    const toastError = vi.fn();
    vi.spyOn(toastModule, "useToast").mockReturnValue({
      error: toastError,
      success: vi.fn(),
      info: vi.fn(),
    } as ReturnType<typeof toastModule.useToast>);
    mockFeedbackFetch({
      myListings: [feedbackListing({ id: "completed_error", ownerUserId: baseUser.id, title: "Completed Error", status: "completed" })],
      myReviews: [feedbackReview({ id: "review_rate_error", listingId: "completed_error", status: "completed" })],
      rateStatus: 400,
      ratePayload: { message: "Rating window closed" },
    });

    const user = userEvent.setup();
    renderWithProviders(<FeedbackPage />);

    await user.click(await screen.findByRole("button", { name: "My Listings" }));
    await user.click(await screen.findByRole("button", { name: "Rate review" }));
    await user.type(screen.getByLabelText("Score (1-5)"), "2");
    await user.click(screen.getByRole("button", { name: "Submit Rating" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Rating window closed");
    });
  });
});
