import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieSet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
    set: mockCookieSet,
    delete: vi.fn()
  }))
}));

import { POST } from "./route";

describe("auth oauth complete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
  });

  it("posts to provider complete endpoint and persists token", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ session: { token: "oauth-token-2" } }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/oauth/google/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "abc123" })
      });

      const response = await POST(request, { params: Promise.resolve({ provider: "google" }) });

      expect(response.status).toBe(200);
      expect(calls[0]?.url).toBe("http://gateway/api/v1/auth/oauth/google/complete");
      expect(calls[0]?.init?.method).toBe("POST");
      expect(calls[0]?.init?.body).toBe('{"code":"abc123"}');
      expect((calls[0]?.init?.headers as Headers | undefined)?.get("content-type")).toBe(
        "application/json"
      );
      expect(mockCookieSet).toHaveBeenCalledWith(
        "sm_session",
        "oauth-token-2",
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
      const request = new Request("http://localhost/api/v1/auth/oauth/google/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "abc123" })
      });
      const response = await POST(request, { params: Promise.resolve({ provider: "google" }) });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("upstream_failure");
      expect(mockCookieSet).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
