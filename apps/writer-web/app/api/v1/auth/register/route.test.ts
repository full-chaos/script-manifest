import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock next/headers so the route can set cookies in tests
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: mockCookieSet
  }))
}));

import { POST } from "./route";

describe("auth register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
  });

  it("sets sm_session HttpOnly cookie on successful registration", async () => {
    const sessionBody = {
      token: "tok_register_xyz",
      expiresAt: "2026-12-31T00:00:00.000Z",
      user: { id: "writer_02", email: "newuser@example.com", displayName: "New User" }
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(sessionBody), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    ) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "Pass1234!",
          displayName: "New User",
          acceptTerms: true
        }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.user.id).toBe("writer_02");
      expect(mockCookieSet).toHaveBeenCalledWith(
        "sm_session",
        "tok_register_xyz",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not set cookie when registration fails (409 conflict)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "email_taken" }), { status: 409 })
    ) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "taken@example.com", password: "pass" }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
      expect(mockCookieSet).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when gateway is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "u@example.com", password: "pass" }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).toBe("api_gateway_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
