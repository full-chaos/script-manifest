import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as unknown as RequestResult;
}

test("GET /api/v1/writers/:handle/resume proxies public resume requests without auth", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ resume: { profile: { id: "writer_01" } } });
    }) as typeof request,
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => { await server.close(); });

  const response = await server.inject({ method: "GET", url: "/api/v1/writers/writer-one/resume" });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/writers/writer-one/resume");
});

test("POST /api/v1/writers/:id/resume-views forwards hashed ip and user agent for dedupe", async (t) => {
  const bodies: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      if (String(url).includes("/internal/auth/me")) {
        return jsonResponse({ user: { id: "viewer_01" } });
      }
      bodies.push(String(options?.body ?? ""));
      return jsonResponse({ recorded: true }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/writers/writer_01/resume-views",
    headers: { authorization: "Bearer token", "user-agent": "ResumeBot", "x-forwarded-for": "203.0.113.7" }
  });

  assert.equal(response.statusCode, 201);
  const body = JSON.parse(bodies[0] ?? "{}") as { ipHash?: string; userAgentHash?: string; viewerUserId?: string };
  assert.equal(body.viewerUserId, "viewer_01");
  assert.equal(body.ipHash?.length, 40);
  assert.equal(body.userAgentHash?.length, 40);
  assert.notEqual(body.ipHash, "203.0.113.7");
});

test("GET /api/v1/writers/me/resume-metrics requires auth and proxies writer-only metrics", async (t) => {
  const urls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const target = String(url);
      if (target.includes("/internal/auth/me")) {
        return jsonResponse({ user: { id: "writer_01" } });
      }
      urls.push(target);
      return jsonResponse({ metrics: { writerId: "writer_01", totalViews7d: 1, totalViews30d: 2, totalScriptDownloads: 0, verifiedPlacementsCount: 3, projectsCount: 4 } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => { await server.close(); });

  const unauth = await server.inject({ method: "GET", url: "/api/v1/writers/me/resume-metrics" });
  assert.equal(unauth.statusCode, 401);

  const authed = await server.inject({ method: "GET", url: "/api/v1/writers/me/resume-metrics", headers: { authorization: "Bearer token" } });
  assert.equal(authed.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/writers/writer_01/resume-metrics");
});
