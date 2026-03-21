import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>(() => undefined);
const mockCookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: vi.fn(),
    delete: mockCookieDelete
  }))
}));

import { POST } from "./route";

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => {
    if (name !== "sm_session" || !token) return undefined;
    return { name: "sm_session", value: token };
  });
}

describe("auth logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken(undefined);
  });

  it("forwards request to gateway and clears session cookie", async () => {
    setCookieToken("logout-token");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/logout?all=true", {
        method: "POST",
        headers: { authorization: "Bearer client-token" }
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(calls[0]?.url).toBe("http://gateway/api/v1/auth/logout?all=true");
      expect((calls[0]?.init?.headers as Headers | undefined)?.get("authorization")).toBe(
        "Bearer logout-token"
      );
      expect(mockCookieDelete).toHaveBeenCalledWith("sm_session");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns upstream 500 and still clears session cookie", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "upstream_failure" }), { status: 500 })) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/auth/logout", { method: "POST" });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("upstream_failure");
      expect(mockCookieDelete).toHaveBeenCalledWith("sm_session");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
