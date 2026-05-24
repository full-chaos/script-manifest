import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCookieGet = vi.fn<(name: string) => { name: string; value: string } | undefined>(() => undefined);

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet, set: vi.fn(), delete: vi.fn() }))
}));

import { GET } from "./route";

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => name === "sm_session" && token ? { name, value: token } : undefined);
}

describe("admin provider review queue proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken(undefined);
  });

  it("proxies queue requests with admin identity", async () => {
    setCookieToken("admin-token");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return new Response(JSON.stringify({ user: { id: "admin_01", role: "admin" } }), { status: 200 });
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await GET(new Request("http://localhost/api/v1/admin/providers/review-queue"));
      expect(response.status).toBe(200);
      expect(calls[1]?.url).toBe("http://gateway/api/v1/coverage/admin/providers/review-queue");
      expect((calls[1]?.init?.headers as Headers).get("x-admin-user-id")).toBe("admin_01");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
