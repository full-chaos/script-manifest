import { describe, expect, it, vi } from "vitest";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    new Response(
      JSON.stringify({ userId: "user_1", email: "writer@example.com" }),
      { status: 200 }
    )
  )
}));

import { GET } from "./route";
import { proxyRequest } from "../../_proxy";

describe("auth me route", () => {
  it("proxies GET to gateway me endpoint", async () => {
    const request = new Request("http://localhost/api/v1/auth/me", {
      method: "GET",
      headers: { authorization: "Bearer sess_abc123" }
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/auth/me");
  });

  it("forwards authorization header to the gateway", async () => {
    const request = new Request("http://localhost/api/v1/auth/me", {
      method: "GET",
      headers: { authorization: "Bearer sess_xyz789" }
    });

    await GET(request);

    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/auth/me");
  });

  it("returns 401 when token is invalid", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
    );

    const request = new Request("http://localhost/api/v1/auth/me", {
      method: "GET",
      headers: { authorization: "Bearer expired_token" }
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 502 when gateway is unavailable", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "api_gateway_unavailable" }), { status: 502 })
    );

    const request = new Request("http://localhost/api/v1/auth/me", {
      method: "GET",
      headers: { authorization: "Bearer sess_down" }
    });

    const response = await GET(request);

    expect(response.status).toBe(502);
  });
});
