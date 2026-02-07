import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";
import { request } from "undici";

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

test("api-gateway proxies submissions list with query params", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ submissions: [{ id: "s1" }] });
    }) as typeof request,
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/submissions?writerId=writer_01&status=pending"
  });

  assert.equal(response.statusCode, 200);
  assert.match(urls[0] ?? "", /http:\/\/submission-svc\/internal\/submissions\?/);
  const payload = response.json();
  assert.equal(payload.submissions.length, 1);
});

test("api-gateway proxies auth register", async (t) => {
  const urls: string[] = [];
  let requestBody = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      requestBody = String(options?.body ?? "");
      return jsonResponse({
        token: "sess_1",
        expiresAt: "2026-02-13T00:00:00.000Z",
        user: { id: "user_1", email: "writer@example.com", displayName: "Writer One" }
      });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "writer@example.com",
      password: "password123",
      displayName: "Writer One"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://identity-svc/internal/auth/register");
  assert.match(requestBody, /"displayName":"Writer One"/);
});

test("api-gateway proxies authenticated me endpoint", async (t) => {
  const authHeaders: Array<string | undefined> = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (_url, options) => {
      authHeaders.push((options?.headers as Record<string, string> | undefined)?.authorization);
      return jsonResponse({
        user: { id: "user_1", email: "writer@example.com", displayName: "Writer One" },
        expiresAt: "2026-02-13T00:00:00.000Z"
      });
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: "Bearer sess_1"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(authHeaders[0], "Bearer sess_1");
});

test("api-gateway proxies project list with query params", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ projects: [{ id: "project_1" }] });
    }) as typeof request,
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/projects?ownerUserId=user_1&genre=drama"
  });

  assert.equal(response.statusCode, 200);
  assert.match(urls[0] ?? "", /http:\/\/profile-svc\/internal\/projects\?/);
  assert.equal(response.json().projects.length, 1);
});

test("api-gateway proxies submission creation", async (t) => {
  let requestBody = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (_url, options) => {
      requestBody = String(options?.body ?? "");
      return jsonResponse({ submission: { id: "submission_1" } }, 201);
    }) as typeof request,
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/submissions",
    payload: {
      writerId: "writer_01",
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.match(requestBody, /"writerId":"writer_01"/);
});

test("api-gateway proxies project co-writer endpoints", async (t) => {
  const urls: string[] = [];
  const methods: Array<string | undefined> = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      methods.push(options?.method);
      return jsonResponse({ coWriters: [] });
    }) as typeof request,
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const getResponse = await server.inject({
    method: "GET",
    url: "/api/v1/projects/project_1/co-writers"
  });
  assert.equal(getResponse.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/projects/project_1/co-writers");
  assert.equal(methods[0], "GET");

  const postResponse = await server.inject({
    method: "POST",
    url: "/api/v1/projects/project_1/co-writers",
    payload: { coWriterUserId: "writer_02", creditOrder: 2 }
  });
  assert.equal(postResponse.statusCode, 200);
  assert.equal(urls[1], "http://profile-svc/internal/projects/project_1/co-writers");
  assert.equal(methods[1], "POST");
});

test("api-gateway proxies submission project reassignment", async (t) => {
  const urls: string[] = [];
  let body = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      body = String(options?.body ?? "");
      return jsonResponse({ submission: { id: "submission_1", projectId: "project_2" } });
    }) as typeof request,
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PATCH",
    url: "/api/v1/submissions/submission_1/project",
    payload: { projectId: "project_2" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/submissions/submission_1/project");
  assert.match(body, /"projectId":"project_2"/);
});
