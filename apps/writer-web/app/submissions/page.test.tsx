import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubmissionsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("SubmissionsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "script_manifest_session",
      JSON.stringify({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: {
          id: "writer_01",
          email: "writer@example.com",
          displayName: "Writer One"
        }
      })
    );
    vi.restoreAllMocks();
  });

  it("loads dependencies and creates a submission", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          projects: [
            {
              id: "project_1",
              ownerUserId: "writer_01",
              title: "My Script",
              logline: "",
              synopsis: "",
              format: "feature",
              genre: "drama",
              pageCount: 110,
              isDiscoverable: true,
              createdAt: "2026-02-06T00:00:00.000Z",
              updatedAt: "2026-02-06T00:00:00.000Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          competitions: [
            {
              id: "comp_1",
              title: "Screenplay Sprint",
              description: "",
              format: "feature",
              genre: "drama",
              feeUsd: 25,
              deadline: "2026-07-01T00:00:00.000Z"
            }
          ]
        })
      )
      .mockResolvedValueOnce(jsonResponse({ submissions: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            submission: {
              id: "submission_1",
              writerId: "writer_01",
              projectId: "project_1",
              competitionId: "comp_1",
              status: "pending",
              createdAt: "2026-02-06T00:00:00.000Z",
              updatedAt: "2026-02-06T00:00:00.000Z"
            }
          },
          201
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<SubmissionsPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Load" }));
    await screen.findByText("Submission data loaded.");

    await user.click(screen.getByRole("button", { name: "Create submission" }));
    await screen.findByText("Submission recorded.");
    expect(screen.getByText("submission_1")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/submissions",
      expect.objectContaining({ method: "POST" })
    );
  });
});
