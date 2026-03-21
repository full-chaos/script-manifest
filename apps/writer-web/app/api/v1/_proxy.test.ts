import { describe, expect, it, vi } from "vitest";

// Mock next/headers so proxyRequest can be tested without a real Next.js runtime
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined)
  }))
}));

import { cookies } from "next/headers";
import { proxyRequest } from "./_proxy";

function mockCookiesWithToken(token: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) =>
      name === "sm_session" && token ? { name: "sm_session", value: token } : undefined
    )
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

function mockCookiesEmpty() {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn(() => undefined)
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("proxyRequest", () => {
  it("forwards query params and auth headers, but NOT x-admin-user-id", async () => {
    mockCookiesEmpty();
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
      // x-admin-user-id must NOT be forwarded from the browser — security hardening
      expect(
        (call?.init?.headers as Headers | undefined)?.get("x-admin-user-id")
      ).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("injects Authorization header from sm_session cookie when present", async () => {
    mockCookiesWithToken("cookie_tok_xyz");
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
        new Request("http://localhost/api/v1/projects", { method: "GET" }),
        "/api/v1/projects"
      );

      expect(response.status).toBe(200);
      const call = calls[0];
      // Cookie token takes precedence — no client Authorization header was sent
      expect(
        (call?.init?.headers as Headers | undefined)?.get("authorization")
      ).toBe("Bearer cookie_tok_xyz");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("cookie token takes precedence over client Authorization header", async () => {
    mockCookiesWithToken("cookie_tok_primary");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      await proxyRequest(
        new Request("http://localhost/api/v1/projects", {
          method: "GET",
          headers: { authorization: "Bearer client_tok_ignored" }
        }),
        "/api/v1/projects"
      );

      const call = calls[0];
      expect(
        (call?.init?.headers as Headers | undefined)?.get("authorization")
      ).toBe("Bearer cookie_tok_primary");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream errors", async () => {
    mockCookiesEmpty();
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
    mockCookiesEmpty();
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
    mockCookiesEmpty();
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
    mockCookiesEmpty();
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

  it("returns 503 for admin paths when auth service is unavailable (network error)", async () => {
    mockCookiesWithToken("admin_tok");
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/admin/users", { method: "GET" }),
        "/api/v1/admin/users"
      );

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("service_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 503 for admin paths when auth service returns 500", async () => {
    mockCookiesWithToken("admin_tok");
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "internal" }), { status: 500 })
    ) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/admin/users", { method: "GET" }),
        "/api/v1/admin/users"
      );

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("service_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 403 for admin paths when user is not admin", async () => {
    mockCookiesWithToken("writer_tok");
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount++;
      // First call is the /auth/me role check
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "a@b.c", displayName: "Writer", role: "writer" } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/admin/users", { method: "GET" }),
        "/api/v1/admin/users"
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("forbidden");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("allows admin paths when user has admin role", async () => {
    mockCookiesWithToken("admin_tok");
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({ user: { id: "u1", email: "a@b.c", displayName: "Admin", role: "admin" } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ users: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/admin/users", { method: "GET" }),
        "/api/v1/admin/users"
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.users).toEqual([]);
      expect(calls).toHaveLength(2);
      const upstreamCall = calls[1]!;
      expect(upstreamCall.url).toBe("http://gateway/api/v1/admin/users");
      expect((upstreamCall.init?.headers as Headers | undefined)?.get("x-admin-user-id")).toBe("u1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 403 for admin paths when admin role response has no user id", async () => {
    mockCookiesWithToken("admin_tok");
    const originalFetch = globalThis.fetch;
    process.env.API_GATEWAY_URL = "http://gateway";
    let callCount = 0;

    globalThis.fetch = (async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ user: { email: "a@b.c", displayName: "Admin", role: "admin" } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ users: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      const response = await proxyRequest(
        new Request("http://localhost/api/v1/admin/users", { method: "GET" }),
        "/api/v1/admin/users"
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("forbidden");
      expect(callCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
