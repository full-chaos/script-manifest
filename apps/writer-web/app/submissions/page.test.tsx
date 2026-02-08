import { render, screen, within } from "@testing-library/react";
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

  it("autoloads dependencies, creates a submission in a modal, and moves it", async () => {
    const projects = [
      {
        id: "project_1",
        ownerUserId: "writer_01",
        title: "Project One",
        logline: "",
        synopsis: "",
        format: "feature",
        genre: "drama",
        pageCount: 100,
        isDiscoverable: true,
        createdAt: "2026-02-06T00:00:00.000Z",
        updatedAt: "2026-02-06T00:00:00.000Z"
      },
      {
        id: "project_2",
        ownerUserId: "writer_01",
        title: "Project Two",
        logline: "",
        synopsis: "",
        format: "feature",
        genre: "drama",
        pageCount: 95,
        isDiscoverable: false,
        createdAt: "2026-02-06T00:00:00.000Z",
        updatedAt: "2026-02-06T00:00:00.000Z"
      }
    ];
    const competitions = [
      {
        id: "comp_1",
        title: "Competition One",
        description: "",
        format: "feature",
        genre: "drama",
        feeUsd: 0,
        deadline: "2026-04-01T00:00:00.000Z"
      }
    ];
    const submissions: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.startsWith("/api/v1/projects?") && method === "GET") {
        return jsonResponse({ projects });
      }

      if (url === "/api/v1/competitions" && method === "GET") {
        return jsonResponse({ competitions });
      }

      if (url.startsWith("/api/v1/submissions?") && method === "GET") {
        return jsonResponse({ submissions });
      }

      if (url === "/api/v1/submissions" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const submission = {
          id: "submission_1",
          writerId: "writer_01",
          projectId: payload.projectId,
          competitionId: payload.competitionId,
          status: payload.status,
          createdAt: "2026-02-06T00:00:00.000Z",
          updatedAt: "2026-02-06T00:00:00.000Z"
        };
        submissions.unshift(submission);
        return jsonResponse({ submission }, 201);
      }

      if (url === "/api/v1/submissions/submission_1/project" && method === "PATCH") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const updated = {
          ...submissions[0],
          projectId: payload.projectId,
          updatedAt: "2026-02-06T01:00:00.000Z"
        };
        submissions[0] = updated;
        return jsonResponse({ submission: updated });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<SubmissionsPage />);
    const user = userEvent.setup();

    await screen.findByText("Submission data loaded.");

    await user.click(screen.getByRole("button", { name: "Create submission" }));
    const dialog = await screen.findByRole("dialog", { name: "Create submission" });
    await user.click(within(dialog).getByRole("button", { name: "Create submission" }));

    await screen.findByText("Submission recorded.");
    expect(screen.getByText("submission_1")).toBeInTheDocument();
    expect(screen.getByText(/project project_1/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Move target for submission_1"), "project_2");
    await user.click(screen.getByRole("button", { name: "Move submission" }));

    await screen.findByText("Submission moved.");
    expect(screen.getByText(/project project_2/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/submissions/submission_1/project",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});
