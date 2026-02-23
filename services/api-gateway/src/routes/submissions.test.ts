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

test("GET /api/v1/submissions proxies query params to submission tracking service", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ submissions: [] });
    }) as typeof request,
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/submissions?competitionId=comp_01&status=submitted"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    urls[0],
    "http://submission-svc/internal/submissions?competitionId=comp_01&status=submitted"
  );
});

test("POST /api/v1/submissions proxies with auth user id when authenticated", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ submission: { id: "sub_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: { authorization: "Bearer sess_1" },
    payload: { competitionId: "comp_01", projectId: "proj_01" }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://submission-svc/internal/submissions");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[0]?.["content-type"], "application/json");
});

test("PATCH /api/v1/submissions/:submissionId/project proxies with auth header", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ submission: { id: "sub_01", projectId: "proj_02" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PATCH",
    url: "/api/v1/submissions/sub_01/project",
    headers: { authorization: "Bearer sess_1" },
    payload: { projectId: "proj_02" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/submissions/sub_01/project");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/placements proxies query params and auth user id", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ placements: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/placements?status=verified",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/placements?status=verified");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/submissions/:submissionId/placements proxies to submission placements", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ placements: [{ id: "placement_01" }] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/submissions/sub_01/placements",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/submissions/sub_01/placements");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/submissions/:submissionId/placements proxies and triggers ranking recompute", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (urlStr.includes("/placements")) {
        return jsonResponse({ placement: { id: "placement_01" } }, 201);
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/submissions/sub_01/placements",
    headers: { authorization: "Bearer sess_1" },
    payload: { competitionId: "comp_01", result: "finalist" }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://submission-svc/internal/submissions/sub_01/placements");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");

  // Wait briefly for the fire-and-forget ranking recompute
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(urls.some((u) => u === "http://ranking-svc/internal/recompute/incremental"));
});

test("GET /api/v1/placements/:placementId proxies to individual placement with auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ placement: { id: "placement_01" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/placements/placement_01",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/placements/placement_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/placements/:placementId/verify proxies and triggers ranking recompute", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ placement: { id: "placement_01", verified: true } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc",
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/placements/placement_01/verify",
    headers: { authorization: "Bearer sess_1" },
    payload: { evidenceUrl: "https://example.com/proof" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/placements/placement_01/verify");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");

  // Wait briefly for the fire-and-forget ranking recompute
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(urls.some((u) => u === "http://ranking-svc/internal/recompute/incremental"));
});
