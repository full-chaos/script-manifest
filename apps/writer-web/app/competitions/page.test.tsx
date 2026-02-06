import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompetitionsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("CompetitionsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("searches and renders competitions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        competitions: [
          {
            id: "comp_1",
            title: "Screenplay Sprint",
            description: "Fast turnaround challenge",
            format: "feature",
            genre: "drama",
            feeUsd: 25,
            deadline: "2026-07-01T00:00:00.000Z"
          }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Keyword"), "Screenplay");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("Screenplay Sprint");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/competitions?query=Screenplay",
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
