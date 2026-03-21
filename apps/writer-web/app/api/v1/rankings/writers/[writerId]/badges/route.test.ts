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

const routeParams = {
  writerId: "writerId-value",
};

type RouteContext = { params: Promise<typeof routeParams> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>;

function setCookieToken(token: string | undefined): void {
  mockCookieGet.mockImplementation((name: string) => {
    if (name !== "sm_session" || !token) return undefined;
    return { name: "sm_session", value: token };
  });
}

function getAuthorizationHeader(init?: RequestInit): string | null {
  return new Headers(init?.headers).get("authorization");
}

const handlers = [
  ["GET", GET],
] satisfies ReadonlyArray<readonly [string, RouteHandler]>;

describe("rankings/writers/[writerId]/badges route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_GATEWAY_URL = "http://gateway";
    setCookieToken(undefined);
  });

  it.each(handlers)("proxies %s with gateway URL and auth header", async (method, handler) => {
    setCookieToken("cookie-token-1");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true, method }), { status: 200 });
    }) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/rankings/writers/writerId-value/badges?cursor=next", {
        method,
        headers: { authorization: "Bearer ignored-client-token" }
      });

      const response = await handler(request, { params: Promise.resolve(routeParams) });

      expect(response.status).toBe(200);
      const target = calls[0];
      expect(target?.url).toBe("http://gateway/api/v1/rankings/writers/writerId-value/badges?cursor=next");
      expect(getAuthorizationHeader(target?.init)).toBe("Bearer cookie-token-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns upstream 500 responses", async () => {
    setCookieToken("cookie-token-2");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "upstream_failure" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    try {
      const request = new Request("http://localhost/api/v1/rankings/writers/writerId-value/badges", {
        method: "GET",
        headers: { authorization: "Bearer client-token" }
      });

      const response = await GET(request, { params: Promise.resolve(routeParams) });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("upstream_failure");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
