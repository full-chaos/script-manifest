import { describe, expect, it } from "vitest";
import { proxyRequest } from "./_proxy";

describe("proxyRequest", () => {
  it("forwards query params and auth headers", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/projects?ownerUserId=user_1", {
          method: "GET",
          headers: {
            authorization: "Bearer sess_1"
          }
        }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(200);
      const call = calls[0];
      expect(call?.url).toBe("http://gateway/api/v1/projects?ownerUserId=user_1");
      expect(
        (call?.init?.headers as Headers | undefined)?.get("authorization")
      ).toBe("Bearer sess_1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream errors", async () => {
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/projects", { method: "GET" }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).toBe("api_gateway_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
