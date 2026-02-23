import { describe, expect, it, vi } from "vitest";

vi.mock("../../_proxy", () => ({
  proxyRequest: vi.fn(async () => new Response(JSON.stringify({ userId: "user_1" }), { status: 201 }))
}));

import { POST } from "./route";
import { proxyRequest } from "../../_proxy";

describe("auth register route", () => {
  it("proxies POST to gateway register endpoint", async () => {
    const request = new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "writer@example.com", password: "secret123" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/auth/register");
  });

  it("forwards auth header when present", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "user_2" }), { status: 201 })
    );

    const request = new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "other@example.com", password: "pass" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer existing_token"
      }
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/auth/register");
  });

  it("returns upstream error status on failure", async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "email_taken" }), { status: 409 })
    );

    const request = new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "taken@example.com", password: "pass" }),
      headers: { "content-type": "application/json" }
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
  });
});
