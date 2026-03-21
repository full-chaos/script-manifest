import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>(() => undefined);

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: vi.fn(),
    delete: vi.fn()
  }))
}));

import { GET } from "./route";

const routeParams = {};

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => {
    if (name !== "sm_session" || !token) return undefined;
    return { name: "sm_session", value: token };
  });
}

describe("admin rankings flags route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken(undefined);
  });

  it.each([
    ["GET", GET]
  ])("proxies %s with gateway URL and auth header", async (method, handler) => {
    setCookieToken("cookie-token-1");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ user: { id: "admin-user-1", role: "admin" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, method }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/admin/rankings/flags?cursor=next", { method, headers: { authorization: "Bearer ignored-client-token" } });
      const response = await handler(request);

      expect(response.status).toBe(200);
      const target = calls[1];
      expect(target?.url).toBe("http://gateway/api/v1/admin/rankings/flags?cursor=next");
      expect((target?.init?.headers as Headers | undefined)?.get("authorization")).toBe("Bearer cookie-token-1");
      expect((target?.init?.headers as Headers | undefined)?.get("x-admin-user-id")).toBe("admin-user-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns upstream 500 responses", async () => {
    setCookieToken("cookie-token-2");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ user: { id: "admin-user-1", role: "admin" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "upstream_failure" }), { status: 500 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/admin/rankings/flags", { method: "GET", headers: { authorization: "Bearer client" } });
      const response = await GET(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("upstream_failure");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
