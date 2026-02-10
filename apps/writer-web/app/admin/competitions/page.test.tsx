import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCompetitionsPage from "./page";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("AdminCompetitionsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("upserts competitions through admin endpoint", async () => {
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

      if (url === "/api/v1/admin/competitions/comp_1" && method === "PUT") {
        return jsonResponse({ competition: competitions[0] });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCompetitionsPage />);
    const user = userEvent.setup();

    await screen.findByText(/Loaded 0 competitions/);

    await user.type(screen.getByLabelText("ID"), "comp_1");
    await user.type(screen.getByLabelText("Title"), "Pilot Lab");
    await user.type(screen.getByLabelText("Description"), "Vetted pilot lab");
    await user.clear(screen.getByLabelText("Fee USD"));
    await user.type(screen.getByLabelText("Fee USD"), "35");
    await user.type(screen.getByLabelText("Deadline"), "2026-09-01T12:00");

    await user.click(screen.getByRole("button", { name: "Save competition" }));

    await screen.findByText("Competition upserted.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/competitions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-admin-user-id": "admin_01" })
      })
    );
  });
});
