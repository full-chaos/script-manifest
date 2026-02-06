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
