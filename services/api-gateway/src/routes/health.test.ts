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
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

test("GET /health returns ok when all downstream services are healthy", async (t) => {
  const checkedUrls: string[] = [];
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      checkedUrls.push(String(url));
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    competitionDirectoryBase: "http://competition-svc",
    submissionTrackingBase: "http://submission-svc",
    scriptStorageBase: "http://script-svc",
    feedbackExchangeBase: "http://feedback-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { service: string; ok: boolean; checks: Record<string, boolean> };
  assert.equal(body.service, "api-gateway");
  assert.equal(body.ok, true);
  assert.equal(body.checks.identity, true);
  assert.equal(body.checks["profile-project"], true);
  assert.equal(body.checks["competition-directory"], true);
  assert.equal(body.checks["submission-tracking"], true);
  assert.equal(body.checks["script-storage"], true);
  assert.equal(body.checks["feedback-exchange"], true);
  assert.equal(body.checks.ranking, true);

  // Verify each downstream health endpoint was called
  assert.ok(checkedUrls.some((u) => u === "http://identity-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://profile-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://competition-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://submission-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://script-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://feedback-svc/health"));
  assert.ok(checkedUrls.some((u) => u === "http://ranking-svc/health"));
});

test("GET /health returns 503 when one downstream service is unhealthy", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      // Make ranking-svc fail
      if (urlStr.includes("ranking-svc")) {
        return jsonResponse({ ok: false }, 503);
      }
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    competitionDirectoryBase: "http://competition-svc",
    submissionTrackingBase: "http://submission-svc",
    scriptStorageBase: "http://script-svc",
    feedbackExchangeBase: "http://feedback-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 503);
  const body = response.json() as { ok: boolean; checks: Record<string, boolean> };
  assert.equal(body.ok, false);
  assert.equal(body.checks.ranking, false);
});

test("GET /health/live always returns 200 regardless of downstream state", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => {
      throw new Error("should not be called");
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/health/live" });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { ok: boolean };
  assert.equal(body.ok, true);
});

test("GET /health/ready returns 200 when all downstream services are healthy", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async () => {
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    competitionDirectoryBase: "http://competition-svc",
    submissionTrackingBase: "http://submission-svc",
    scriptStorageBase: "http://script-svc",
    feedbackExchangeBase: "http://feedback-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/health/ready" });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { service: string; ok: boolean };
  assert.equal(body.service, "api-gateway");
  assert.equal(body.ok, true);
});

test("GET /health/ready returns 503 when a downstream service throws", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("feedback-svc")) {
        throw new Error("connection refused");
      }
      return jsonResponse({ ok: true }, 200);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    competitionDirectoryBase: "http://competition-svc",
    submissionTrackingBase: "http://submission-svc",
    scriptStorageBase: "http://script-svc",
    feedbackExchangeBase: "http://feedback-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/health/ready" });

  assert.equal(response.statusCode, 503);
  const body = response.json() as { ok: boolean; checks: Record<string, boolean> };
  assert.equal(body.ok, false);
  assert.equal(body.checks["feedback-exchange"], false);
});
