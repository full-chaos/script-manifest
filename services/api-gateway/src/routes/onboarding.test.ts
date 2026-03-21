import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      dump: async () => undefined
    }
  } as RequestResult;
}

test("onboarding routes proxy status and progress with auth header forwarding", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (options?.body) {
        bodies.push(String(options.body));
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const status = await server.inject({
    method: "GET",
    url: "/api/v1/onboarding/status",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(status.statusCode, 200);

  const progress = await server.inject({
    method: "PATCH",
    url: "/api/v1/onboarding/progress",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { step: "profile", completed: true }
  });
  assert.equal(progress.statusCode, 200);

  assert.equal(urls[0], "http://identity-svc/internal/onboarding/status");
  assert.equal(urls[1], "http://identity-svc/internal/onboarding/progress");
  assert.equal(headers[0]?.authorization, "Bearer sess_1");
  assert.equal(headers[1]?.authorization, "Bearer sess_1");
  assert.equal(headers[1]?.["content-type"], "application/json");
  assert.equal(JSON.parse(bodies[0] ?? "{}").step, "profile");
});
