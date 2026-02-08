import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("ProfilePage", () => {
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

  it("autoloads and updates a profile", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          profile: {
            id: "writer_01",
            displayName: "Writer One",
            bio: "First draft",
            genres: ["Drama"],
            representationStatus: "unrepresented"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          profile: {
            id: "writer_01",
            displayName: "Writer Updated",
            bio: "Updated bio",
            genres: ["Drama", "Thriller"],
            representationStatus: "seeking_rep"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePage />);
    const user = userEvent.setup();

    await screen.findByDisplayValue("Writer One");

    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Writer Updated");
    const bio = screen.getByLabelText("Bio");
    await user.clear(bio);
    await user.type(bio, "Updated bio");
    await user.selectOptions(screen.getByLabelText("Representation status"), "seeking_rep");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await screen.findByText("Profile saved.");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/profiles/writer_01",
      expect.objectContaining({ cache: "no-store" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/profiles/writer_01",
      expect.objectContaining({ method: "PUT" })
    );
  });
});
