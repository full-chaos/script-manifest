import { cleanup, render, screen, within } from "@testing-library/react";
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
    cleanup();
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

  it("searches and renders a sorted upcoming deadline calendar", async () => {
    const competitions = [
      {
        id: "comp_1",
        title: "Screenplay Sprint",
        description: "Fast turnaround challenge",
        format: "feature",
        genre: "drama",
        feeUsd: 25,
        deadline: "2030-06-01T00:00:00.000Z"
      },
      {
        id: "comp_2",
        title: "Pilot Open",
        description: "TV pilot competition",
        format: "tv",
        genre: "comedy",
        feeUsd: 20,
        deadline: "2030-04-01T00:00:00.000Z"
      },
      {
        id: "comp_3",
        title: "Past Festival",
        description: "Already closed",
        format: "short",
        genre: "drama",
        feeUsd: 0,
        deadline: "2020-01-01T00:00:00.000Z"
      }
    ];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && url.startsWith("/api/v1/competitions?")) {
        return jsonResponse({ competitions });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Keyword"), "Screenplay");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("Found 3 competitions.");

    const calendar = screen.getByRole("list", { name: "Upcoming deadline calendar" });
    const calendarItems = within(calendar).getAllByRole("heading", { level: 3 });
    expect(calendarItems.map((item) => item.textContent)).toEqual([
      "Pilot Open",
      "Screenplay Sprint"
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/competitions?query=Screenplay",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("opens reminder modal, defaults target user, and submits reminder request", async () => {
    const competitions = [
      {
        id: "comp_1",
        title: "Screenplay Sprint",
        description: "Fast turnaround challenge",
        format: "feature",
        genre: "drama",
        feeUsd: 25,
        deadline: "2030-06-01T00:00:00.000Z"
      }
    ];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && url.startsWith("/api/v1/competitions?")) {
        return jsonResponse({ competitions });
      }

      if (method === "POST" && url === "/api/v1/competitions/comp_1/deadline-reminders") {
        return jsonResponse({ accepted: true, eventId: "evt_123" }, 202);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CompetitionsPage />);
    const user = userEvent.setup();

    await screen.findByText("Found 1 competitions.");

    await user.click(screen.getByRole("button", { name: "Set reminder" }));
    const dialog = await screen.findByRole("dialog", { name: "Set deadline reminder" });

    const targetInput = within(dialog).getByLabelText("Target user ID") as HTMLInputElement;
    expect(targetInput.value).toBe("writer_01");

    await user.type(within(dialog).getByLabelText("Message (optional)"), "Submission closes soon");
    await user.click(within(dialog).getByRole("button", { name: "Send reminder" }));

    await screen.findByText("Reminder scheduled for Screenplay Sprint.");

    const reminderCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      return method === "POST" && url === "/api/v1/competitions/comp_1/deadline-reminders";
    });

    expect(reminderCall).toBeDefined();

    const requestInit = reminderCall?.[1] as RequestInit;
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer sess_1"
        })
      })
    );

    expect(JSON.parse(String(requestInit.body))).toEqual({
      targetUserId: "writer_01",
      actorUserId: "writer_01",
      deadlineAt: "2030-06-01T00:00:00.000Z",
      message: "Submission closes soon"
    });
  });
});
