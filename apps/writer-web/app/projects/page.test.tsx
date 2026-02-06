import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("ProjectsPage", () => {
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

  it("loads, creates, and deletes projects", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ projects: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            project: {
              id: "project_1",
              ownerUserId: "writer_01",
              title: "My Script",
              logline: "A writer keeps shipping",
              synopsis: "",
              format: "feature",
              genre: "drama",
              pageCount: 110,
              isDiscoverable: true,
              createdAt: "2026-02-06T00:00:00.000Z",
              updatedAt: "2026-02-06T00:00:00.000Z"
            }
          },
          201
        )
      )
      .mockResolvedValueOnce(jsonResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectsPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Load projects" }));
    await screen.findByText("Loaded 0 projects.");

    await user.type(screen.getByLabelText("Title"), "My Script");
    await user.type(screen.getByLabelText("Logline"), "A writer keeps shipping");
    await user.click(screen.getByRole("checkbox", { name: "Discoverable" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await screen.findByText("Project created.");
    expect(screen.getByText("My Script")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.queryByText("My Script")).not.toBeInTheDocument();
    });
  });
});
