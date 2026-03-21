import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: mockCookieSet,
    delete: vi.fn()
  }))
}));

import { GET } from "./route";

describe("auth oauth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
  });

  it("builds provider callback URL, forwards query params, and stores token", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ token: "oauth-token-1", user: { id: "u1" } }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/oauth/github/callback?code=abc&state=xyz", {
        method: "GET",
        headers: { authorization: "Bearer ignored" }
      });

      const response = await GET(request, { params: Promise.resolve({ provider: "github" }) });

      expect(response.status).toBe(200);
      expect(calls[0]?.url).toBe("http://gateway/api/v1/auth/oauth/github/callback?code=abc&state=xyz");
      expect(calls[0]?.init?.method).toBe("GET");
      expect(mockCookieSet).toHaveBeenCalledWith(
        "sm_session",
        "oauth-token-1",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns upstream 500 payload without setting cookie", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "upstream_failure" }), { status: 500 })) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/oauth/github/callback?code=abc", {
        method: "GET"
      });
      const response = await GET(request, { params: Promise.resolve({ provider: "github" }) });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("upstream_failure");
      expect(mockCookieSet).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
