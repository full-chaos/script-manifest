import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

const BASE = "http://localhost:3000";
let originalFetch: typeof globalThis.fetch;

function makeRequest(path: string, cookies?: Record<string, string>): NextRequest {
  const url = new URL(path, BASE);
  const headers = new Headers();
  if (cookies) {
    headers.set("cookie", Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  }
  return new NextRequest(url, { headers });
}

function mockAuthMe(role: string | null, ok = true) {
  globalThis.fetch = vi.fn(async () =>
    ok
      ? new Response(JSON.stringify({ user: { id: "u_1", role } }), { status: 200 })
      : new Response(null, { status: 401 })
  ) as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  process.env.API_GATEWAY_URL = "http://gateway";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.API_GATEWAY_URL;
});

describe("proxy config matcher", () => {
  it("includes admin paths", () => {
    expect(config.matcher).toContain("/admin");
    expect(config.matcher).toContain("/admin/:path*");
  });

  it("includes auth pages", () => {
    expect(config.matcher).toContain("/signin");
    expect(config.matcher).toContain("/forgot-password");
    expect(config.matcher).toContain("/reset-password");
  });
});

describe("admin route guard", () => {
  it("redirects to /signin when no session cookie", async () => {
    const response = await proxy(makeRequest("/admin"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/signin");
  });

  it("redirects to /signin for /admin/users without session", async () => {
    const response = await proxy(makeRequest("/admin/users"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/signin");
  });

  it("redirects to / when session exists but role is not admin", async () => {
    mockAuthMe("writer");
    const response = await proxy(makeRequest("/admin", { sm_session: "tok_1" }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("redirects to / when auth/me returns no role", async () => {
    mockAuthMe(null);
    const response = await proxy(makeRequest("/admin", { sm_session: "tok_1" }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("redirects to / when auth/me returns 401", async () => {
    mockAuthMe(null, false);
    const response = await proxy(makeRequest("/admin", { sm_session: "tok_1" }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("allows admin users through to /admin", async () => {
    mockAuthMe("admin");
    const response = await proxy(makeRequest("/admin", { sm_session: "tok_1" }));
    expect(response.status).toBe(200);
  });

  it("allows admin users through to /admin/users", async () => {
    mockAuthMe("admin");
    const response = await proxy(makeRequest("/admin/users", { sm_session: "tok_1" }));
    expect(response.status).toBe(200);
  });

  it("allows admin users through to deep admin paths", async () => {
    mockAuthMe("admin");
    const response = await proxy(makeRequest("/admin/users/u_1", { sm_session: "tok_1" }));
    expect(response.status).toBe(200);
  });

  it("passes session token as Bearer to auth/me", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: "u_1", role: "admin" } }), { status: 200 })
    ) as typeof fetch;
    globalThis.fetch = fetchSpy;

    await proxy(makeRequest("/admin", { sm_session: "my_secret_token" }));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = (fetchSpy as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("http://gateway/api/v1/auth/me");
    expect((init as RequestInit).headers).toEqual({ authorization: "Bearer my_secret_token" });
  });
});

describe("auth page redirects (existing behavior)", () => {
  it("redirects signed-in users away from /signin", async () => {
    const response = await proxy(makeRequest("/signin", { sm_session: "tok_1" }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("allows /signin for unauthenticated users", async () => {
    const response = await proxy(makeRequest("/signin"));
    expect(response.status).toBe(200);
  });

  it("allows OAuth callback with ?code= even when signed in", async () => {
    const response = await proxy(makeRequest("/signin?code=abc&state=xyz", { sm_session: "tok_1" }));
    expect(response.status).toBe(200);
  });
});
