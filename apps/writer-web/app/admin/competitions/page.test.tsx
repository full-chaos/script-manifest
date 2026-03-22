import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockUseAuth } from "../../../vitest.setup";
import AdminCompetitionsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("AdminCompetitionsPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user_1",
        email: "w@test.com",
        displayName: "Writer",
        role: "admin",
        emailVerified: true
      },
      loading: false
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates a competition through admin endpoint", async () => {
    const competitions: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url === "/api/v1/competitions" && method === "GET") {
        return jsonResponse({ competitions });
      }

      if (url === "/api/v1/admin/competitions" && method === "POST") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        competitions.unshift(payload);
        return jsonResponse({ competition: payload }, 201);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCompetitionsPage />);
    const user = userEvent.setup();

    await screen.findByText(/Loaded 0 competitions/);

    await user.type(screen.getByLabelText("Title"), "Pilot Lab");
    await user.type(screen.getByLabelText("Description"), "Vetted pilot lab");
    await user.clear(screen.getByLabelText("Fee USD"));
    await user.type(screen.getByLabelText("Fee USD"), "35");
    await user.type(screen.getByLabelText("Deadline"), "2026-09-01T12:00");

    await user.click(screen.getByRole("button", { name: "Create competition" }));

    await screen.findByText(/Competition "Pilot Lab" created/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/competitions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" })
      })
    );
  });

  it("edits an existing competition via edit button", async () => {
    const competitions = [
      { id: "comp_1", title: "Sprint", description: "A sprint", format: "feature", genre: "drama", feeUsd: 25, deadline: "2026-10-01T00:00:00.000Z" }
    ];

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url === "/api/v1/competitions" && method === "GET") {
        return jsonResponse({ competitions });
      }

      if (url.startsWith("/api/v1/admin/competitions/") && method === "PUT") {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        competitions[0] = payload as typeof competitions[0];
        return jsonResponse({ competition: payload });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCompetitionsPage />);
    const user = userEvent.setup();

    await screen.findByText("Sprint");

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]!);

    // Form should be populated with competition data
    expect(screen.getByLabelText("Title")).toHaveValue("Sprint");

    // Update the title
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Sprint v2");

    await user.click(screen.getByRole("button", { name: "Update competition" }));

    await screen.findByText(/Competition "Sprint v2" updated/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/competitions/comp_1",
      expect.objectContaining({ method: "PUT" })
    );
  });
});
