import { describe, expect, it, vi } from "vitest";

vi.mock("../../../_proxy", () => ({
  proxyRequest: vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 202 }))
}));

import { POST } from "./route";
import { proxyRequest } from "../../../_proxy";

describe("competition deadline reminders route", () => {
  it("proxies with encoded competition id", async () => {
    const request = new Request("http://localhost/api/v1/competitions/comp_001/deadline-reminders", {
      method: "POST",
      body: JSON.stringify({ targetUserId: "writer_01" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request, {
      params: Promise.resolve({ competitionId: "comp 001" })
    });

    expect(response.status).toBe(202);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(
      request,
      "/api/v1/competitions/comp%20001/deadline-reminders"
    );
  });
});
