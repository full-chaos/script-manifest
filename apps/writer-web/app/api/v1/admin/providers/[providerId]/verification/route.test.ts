import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>(() => undefined);

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet, set: vi.fn(), delete: vi.fn() }))
}));

import { GET, PATCH } from "./route";

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => name === "sm_session" && token ? { name, value: token } : undefined);
}

describe("admin provider verification proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken("admin-token");
  });

  it("proxies PATCH and GET event requests for a provider", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1 || calls.length === 3) return new Response(JSON.stringify({ user: { id: "admin_01", role: "admin" } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const patchResponse = await PATCH(
        new Request("http://localhost/api/v1/admin/providers/prov_01/verification", { method: "PATCH", body: JSON.stringify({ state: "verified" }), headers: { "content-type": "application/json" } }),
        { params: Promise.resolve({ providerId: "prov_01" }) }
      );
      expect(patchResponse.status).toBe(200);
      expect(calls[1]?.url).toBe("http://gateway/api/v1/coverage/admin/providers/prov_01/verification");
      expect(calls[1]?.init?.method).toBe("PATCH");

      const getResponse = await GET(
        new Request("http://localhost/api/v1/admin/providers/prov_01/verification"),
        { params: Promise.resolve({ providerId: "prov_01" }) }
      );
      expect(getResponse.status).toBe(200);
      expect(calls[3]?.url).toBe("http://gateway/api/v1/coverage/admin/providers/prov_01/verification-events");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
