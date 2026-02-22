import { describe, expect, it } from "vitest";
import { proxyRequest } from "./_proxy";

describe("proxyRequest", () => {
  it("forwards query params, auth headers, and admin headers", async () => {
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
            authorization: "Bearer sess_1",
            "x-admin-user-id": "admin_01"
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
      expect(
        (call?.init?.headers as Headers | undefined)?.get("x-admin-user-id")
      ).toBe("admin_01");
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

  it("forwards request body for non-GET methods", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/projects", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer sess_2"
          },
          body: JSON.stringify({ title: "Test Project" })
        }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(201);
      const call = calls[0];
      expect(call?.url).toBe("http://gateway/api/v1/projects");
      expect(call?.init?.method).toBe("POST");
      expect(call?.init?.body).toBe('{"title":"Test Project"}');
      expect(
        (call?.init?.headers as Headers | undefined)?.get("content-type")
      ).toBe("application/json");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles empty upstream response body", async () => {
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/projects", { method: "GET" }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([
    {
      name: "json upstream body",
      upstreamBody: JSON.stringify({ ok: true, source: "gateway" }),
      expectedBody: { ok: true, source: "gateway" }
    },
    {
      name: "plain-text upstream body",
      upstreamBody: "gateway returned plain text",
      expectedBody: "gateway returned plain text"
    }
  ])("parses $name safely", async ({ upstreamBody, expectedBody }) => {
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async () => new Response(upstreamBody, { status: 202 })) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/projects", { method: "GET" }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual(expectedBody);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
