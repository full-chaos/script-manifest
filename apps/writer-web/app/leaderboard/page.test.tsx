import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/fetcher";
import { serverFetch } from "../lib/serverFetch";
import LeaderboardPage from "./page";

vi.mock("../lib/serverFetch", () => ({
  serverFetch: vi.fn()
}));

const pushMock = vi.fn();
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => useSearchParamsMock()
}));

const serverFetchMock = vi.mocked(serverFetch);

function leaderboardEntry(overrides: Record<string, unknown> = {}) {
  return {
    writerId: "writer_01",
    rank: 1,
    totalScore: 9,
    submissionCount: 3,
    placementCount: 2,
    tier: "top_10",
    badges: ["Finalist - Austin 2025"],
    scoreChange30d: 2.5,
    lastUpdatedAt: "2026-02-06T00:00:00.000Z",
    ...overrides
  };
}

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await LeaderboardPage({ searchParams: Promise.resolve(searchParams) });
  return render(element);
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    serverFetchMock.mockReset();
    pushMock.mockReset();
    useSearchParamsMock.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders leaderboard rows from serverFetch", async () => {
    serverFetchMock.mockResolvedValue({
      leaderboard: [leaderboardEntry()],
      total: 1
    });

    await renderPage({ format: "feature", genre: "drama" });

    expect(serverFetchMock).toHaveBeenCalledWith("/api/v1/leaderboard", {
      searchParams: { format: "feature", genre: "drama" }
    });
    expect(screen.getByText("writer_01")).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("3 submitted")).toBeInTheDocument();
    expect(screen.getByText("2 placed")).toBeInTheDocument();
  });

  it("renders writer and score content in SSR HTML", async () => {
    serverFetchMock.mockResolvedValue({
      leaderboard: [leaderboardEntry({ writerId: "writer_server", totalScore: 42 })],
      total: 1
    });

    const { container } = await renderPage();

    expect(container.innerHTML).toContain("writer_server");
    expect(container.innerHTML).toContain("42.0");
  });

  it("renders tier badges", async () => {
    serverFetchMock.mockResolvedValue({
      leaderboard: [leaderboardEntry({ totalScore: 50, submissionCount: 5, placementCount: 3, tier: "top_1", badges: [], scoreChange30d: 0 })],
      total: 1
    });

    await renderPage();

    const tierBadges = screen.getAllByText("Top 1%");
    const badgeSpan = tierBadges.find((el) => el.tagName === "SPAN" && el.className.includes("rounded-full"));
    expect(badgeSpan).toBeTruthy();
  });

  it("renders badge chips", async () => {
    serverFetchMock.mockResolvedValue({
      leaderboard: [leaderboardEntry({ totalScore: 20, submissionCount: 2, placementCount: 1, tier: null, badges: ["Winner - Sundance 2026"], scoreChange30d: 0 })],
      total: 1
    });

    await renderPage();

    expect(screen.getByText("Winner - Sundance 2026")).toBeInTheDocument();
  });

  it("renders trending indicators", async () => {
    serverFetchMock.mockResolvedValue({
      leaderboard: [leaderboardEntry({ totalScore: 30, submissionCount: 4, placementCount: 2, scoreChange30d: 5.5 })],
      total: 1
    });

    await renderPage();

    expect(screen.getByText(/5\.5/)).toBeInTheDocument();
  });

  it("renders empty state when no writers", async () => {
    serverFetchMock.mockResolvedValue({ leaderboard: [], total: 0 });

    await renderPage();

    expect(screen.getByText("The spotlight is waiting")).toBeInTheDocument();
    expect(screen.getByText("0 total")).toBeInTheDocument();
  });

  it("renders ApiError messages inline", async () => {
    serverFetchMock.mockRejectedValue(new ApiError("Forbidden access", { status: 403 }));

    await renderPage();

    expect(screen.getByText("Forbidden access")).toBeInTheDocument();
  });

  it("filter form pushes query string changes", async () => {
    serverFetchMock.mockResolvedValue({ leaderboard: [], total: 0 });
    useSearchParamsMock.mockReturnValue(new URLSearchParams("format=feature&genre=drama&tier=top_10&trending=true"));

    await renderPage({ format: "feature", genre: "drama", tier: "top_10", trending: "true" });

    expect(screen.getByLabelText("Format filter")).toHaveValue("feature");
    expect(screen.getByLabelText("Genre filter")).toHaveValue("drama");
    expect(screen.getByLabelText("Tier")).toHaveValue("top_10");
    expect(screen.getByLabelText("Trending")).toBeChecked();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Format filter"));
    await user.type(screen.getByLabelText("Format filter"), "short");
    await user.selectOptions(screen.getByLabelText("Tier"), "top_25");
    await user.click(screen.getByLabelText("Trending"));
    await user.click(screen.getByRole("button", { name: "Refresh leaderboard" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenLastCalledWith("/leaderboard?format=short&genre=drama&tier=top_25");
    });
  });

  it("reset clears filters", async () => {
    serverFetchMock.mockResolvedValue({ leaderboard: [], total: 0 });
    useSearchParamsMock.mockReturnValue(new URLSearchParams("format=feature"));

    await renderPage({ format: "feature" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Reset" }));

    expect(pushMock).toHaveBeenCalledWith("/leaderboard");
  });
});
