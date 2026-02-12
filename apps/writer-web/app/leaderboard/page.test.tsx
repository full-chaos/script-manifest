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
              totalScore: 9,
              submissionCount: 3,
              placementCount: 2,
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

    await screen.findByText("writer_01");
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("3 submitted")).toBeInTheDocument();
    expect(screen.getByText("2 placed")).toBeInTheDocument();
  });
});
