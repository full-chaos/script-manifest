import { describe, expect, it, vi } from "vitest";

vi.mock("../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    new Response(JSON.stringify({ writers: [], total: 0 }), { status: 200 })
  )
}));

import { GET } from "./route";
import { proxyRequest } from "../_proxy";

describe("leaderboard route", () => {
  it("proxies GET to gateway leaderboard endpoint", async () => {
    const request = new Request("http://localhost/api/v1/leaderboard", {
      method: "GET"
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/leaderboard");
  });

  it("forwards authorization header for authenticated requests", async () => {
    const request = new Request("http://localhost/api/v1/leaderboard", {
      method: "GET",
      headers: { authorization: "Bearer sess_abc123" }
    });

    await GET(request);

    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/leaderboard");
  });

  it("forwards query parameters for pagination and filtering", async () => {
    const request = new Request(
      "http://localhost/api/v1/leaderboard?page=2&limit=25&genre=drama",
      {
        method: "GET"
      }
    );

    await GET(request);

    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/leaderboard");
  });

  it("returns 502 when gateway is unavailable", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "api_gateway_unavailable" }), { status: 502 })
    );

    const request = new Request("http://localhost/api/v1/leaderboard", {
      method: "GET"
    });

    const response = await GET(request);

    expect(response.status).toBe(502);
  });
});
