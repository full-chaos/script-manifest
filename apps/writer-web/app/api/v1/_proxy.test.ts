import assert from "node:assert/strict";
import test from "node:test";
import { proxyRequest } from "./_proxy";

test("proxyRequest forwards query params and auth headers", async (t) => {
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

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await proxyRequest(
    new Request("http://localhost/api/v1/projects?ownerUserId=user_1", {
      method: "GET",
      headers: {
        authorization: "Bearer sess_1"
      }
    }),
    "/api/v1/projects"
  );

  assert.equal(response.status, 200);
  const call = calls[0];
  assert.equal(call?.url, "http://gateway/api/v1/projects?ownerUserId=user_1");
  assert.equal(
    (call?.init?.headers as Headers | undefined)?.get("authorization"),
    "Bearer sess_1"
  );
});

test("proxyRequest returns 502 when upstream errors", async (t) => {
  const originalFetch = globalThis.fetch;
  process.env.API_GATEWAY_URL = "http://gateway";
  globalThis.fetch = (async () => {
    throw new Error("connection refused");
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await proxyRequest(
    new Request("http://localhost/api/v1/projects", { method: "GET" }),
    "/api/v1/projects"
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "api_gateway_unavailable");
});
