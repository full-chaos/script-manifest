import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock next/headers so the route can set cookies in tests
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: mockCookieSet
  }))
}));

import { POST } from "./route";

describe("auth login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
  });

  it("sets sm_session HttpOnly cookie on successful login and returns session body", async () => {
    const sessionBody = {
      token: "tok_login_abc",
      expiresAt: "2026-12-31T00:00:00.000Z",
      user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" }
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(sessionBody), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "writer@example.com", password: "Pass1234!" }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.user.id).toBe("writer_01");
      // Cookie must be set with the token
      expect(mockCookieSet).toHaveBeenCalledWith(
        "sm_session",
        "tok_login_abc",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not set cookie when login fails (401)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 })
    ) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "bad@example.com", password: "wrong" }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
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
      const request = new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", password: "pass" }),
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

  it("returns the full session body (minus token in cookie) to the client", async () => {
    const sessionBody = {
      token: "tok_check",
      expiresAt: "2027-01-01T00:00:00.000Z",
      user: { id: "u2", email: "u2@example.com", displayName: "User Two" }
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(sessionBody), { status: 200 })
    ) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "u2@example.com", password: "Pass1!" }),
        headers: { "content-type": "application/json" }
      });

      const response = await POST(request);
      const body = await response.json();

      // Full body returned so client can read user info (token still present for backward compat)
      expect(body.user.id).toBe("u2");
      expect(body.expiresAt).toBe("2027-01-01T00:00:00.000Z");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
