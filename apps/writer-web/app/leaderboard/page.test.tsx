import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeaderboardPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads leaderboard rows and applies filters", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("format=feature") && url.includes("genre=drama")) {
        return jsonResponse({
          leaderboard: [
            {
              writerId: "writer_01",
              rank: 1,
              totalScore: 9,
              submissionCount: 3,
              placementCount: 2,
              tier: "top_10",
              badges: ["Finalist - Austin 2025"],
              scoreChange30d: 2.5,
              lastUpdatedAt: "2026-02-06T00:00:00.000Z"
            }
          ],
          total: 1
        });
      }
      return jsonResponse({ leaderboard: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    const user = userEvent.setup();

    await screen.findByText(/Loaded 0 leaderboard rows/);

    await user.type(screen.getByLabelText("Format filter"), "feature");
    await user.type(screen.getByLabelText("Genre filter"), "drama");
    await user.click(screen.getByRole("button", { name: "Refresh leaderboard" }));

    await screen.findAllByText("writer_01");
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText("3 submitted")).toBeInTheDocument();
    expect(screen.getByText("2 placed")).toBeInTheDocument();
  });

  it("renders tier badges", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return jsonResponse({
        leaderboard: [
          {
            writerId: "writer_01",
            rank: 1,
            totalScore: 50,
            submissionCount: 5,
            placementCount: 3,
            tier: "top_1",
            badges: [],
            scoreChange30d: 0,
            lastUpdatedAt: "2026-02-06T00:00:00.000Z"
          }
        ],
        total: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    await screen.findAllByText("writer_01");
    // Tier badge is a span with the tier class, distinct from the <option> elements
    const tierBadges = screen.getAllByText("Top 1%");
    const badgeSpan = tierBadges.find((el) => el.tagName === "SPAN" && el.className.includes("rounded-full"));
    expect(badgeSpan).toBeTruthy();
  });

  it("renders badge chips", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return jsonResponse({
        leaderboard: [
          {
            writerId: "writer_01",
            rank: 1,
            totalScore: 20,
            submissionCount: 2,
            placementCount: 1,
            tier: null,
            badges: ["Winner - Sundance 2026"],
            scoreChange30d: 0,
            lastUpdatedAt: "2026-02-06T00:00:00.000Z"
          }
        ],
        total: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    await screen.findAllByText("writer_01");
    expect(screen.getByText("Winner - Sundance 2026")).toBeInTheDocument();
  });

  it("renders trending indicators", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return jsonResponse({
        leaderboard: [
          {
            writerId: "writer_01",
            rank: 1,
            totalScore: 30,
            submissionCount: 4,
            placementCount: 2,
            tier: "top_10",
            badges: [],
            scoreChange30d: 5.5,
            lastUpdatedAt: "2026-02-06T00:00:00.000Z"
          }
        ],
        total: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LeaderboardPage />);
    await screen.findAllByText("writer_01");
    expect(screen.getByText(/5\.5/)).toBeInTheDocument();
  });
});
