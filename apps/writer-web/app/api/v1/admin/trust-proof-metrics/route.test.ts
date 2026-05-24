import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>(() => undefined);

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    set: vi.fn(),
    delete: vi.fn()
  }))
}));

import { GET, POST } from "./route";

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => {
    if (name !== "sm_session" || !token) return undefined;
    return { name: "sm_session", value: token };
  });
}

describe("admin trust proof metrics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken(undefined);
  });

  it.each([
    ["GET", GET, "/api/v1/admin/trust-proof-metrics"],
    ["POST", POST, "/api/v1/admin/trust-proof-metrics/refresh"]
  ])("proxies %s with admin cookie credentials", async (method, handler, expectedPath) => {
    setCookieToken("admin-cookie");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ user: { id: "admin_1", role: "admin" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ metrics: { snapshotAt: "2026-05-24T12:00:00.000Z" } }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request(`http://localhost${expectedPath}`, { method });
      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(calls[1]?.url).toBe(`http://gateway${expectedPath}`);
      expect((calls[1]?.init?.headers as Headers | undefined)?.get("authorization")).toBe("Bearer admin-cookie");
      expect((calls[1]?.init?.headers as Headers | undefined)?.get("x-admin-user-id")).toBe("admin_1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
