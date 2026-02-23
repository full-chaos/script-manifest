import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () =>
    NextResponse.json({ token: "sess_abc123" }, { status: 200 })
  )
}));

import { POST } from "./route";
import { proxyRequest } from "../../_proxy";

describe("auth login route", () => {
  it("proxies POST to gateway login endpoint", async () => {
    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "writer@example.com", password: "secret123" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/auth/login");
  });

  it("returns session token on success", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      NextResponse.json({ token: "sess_new_token" }, { status: 200 })
    );

    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "mypassword" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it("returns 401 when credentials are invalid", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      NextResponse.json({ error: "invalid_credentials" }, { status: 401 })
    );

    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "bad@example.com", password: "wrong" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 502 when gateway is unavailable", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      NextResponse.json({ error: "api_gateway_unavailable" }, { status: 502 })
    );

    const request = new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com", password: "pass" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
  });
});
