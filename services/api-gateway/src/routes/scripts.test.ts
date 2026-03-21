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

test("scripts routes proxy upload/register/access/view endpoints", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (options?.body) {
        bodies.push(String(options.body));
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    scriptStorageBase: "http://script-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const unauthorizedUpload = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/upload-session",
    headers: { "content-type": "application/json" },
    payload: {}
  });
  assert.equal(unauthorizedUpload.statusCode, 401);

  const invalidUpload = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/upload-session",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { scriptId: "script_1" }
  });
  assert.equal(invalidUpload.statusCode, 400);

  const uploadSession = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/upload-session",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      scriptId: "script_1",
      ownerUserId: "writer_01",
      filename: "draft.fountain",
      contentType: "application/fountain",
      size: 1200
    }
  });
  assert.equal(uploadSession.statusCode, 200);

  const register = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/register",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      scriptId: "script_1",
      ownerUserId: "writer_01",
      objectKey: "uploads/script_1.fountain",
      filename: "draft.fountain",
      contentType: "application/fountain",
      size: 1200
    }
  });
  assert.equal(register.statusCode, 200);

  const createAccessRequest = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script 1/access-requests",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      requesterUserId: "writer_01",
      ownerUserId: "owner_01",
      reason: "Please review"
    }
  });
  assert.equal(createAccessRequest.statusCode, 200);

  const listAccessRequests = await server.inject({
    method: "GET",
    url: "/api/v1/scripts/script 1/access-requests?status=pending",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(listAccessRequests.statusCode, 200);

  const approve = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script 1/access-requests/req 1/approve",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { decisionReason: "Looks good" }
  });
  assert.equal(approve.statusCode, 200);

  const reject = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script 1/access-requests/req 2/reject",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { decisionReason: "Not now" }
  });
  assert.equal(reject.statusCode, 200);

  const viewNoAuth = await server.inject({
    method: "GET",
    url: "/api/v1/scripts/script_1/view"
  });
  assert.equal(viewNoAuth.statusCode, 401);

  const view = await server.inject({
    method: "GET",
    url: "/api/v1/scripts/script 1/view",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(view.statusCode, 200);

  const approveViewer = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script 1/approve-viewer",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { viewerUserId: "writer_02" }
  });
  assert.equal(approveViewer.statusCode, 200);

  const visibility = await server.inject({
    method: "PATCH",
    url: "/api/v1/scripts/script 1/visibility",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { visibility: "public" }
  });
  assert.equal(visibility.statusCode, 200);

  assert.equal(urls[0], "http://script-svc/internal/scripts/upload-session");
  assert.equal(urls[1], "http://script-svc/internal/scripts/register");
  assert.equal(urls[2], "http://profile-svc/internal/scripts/script%201/access-requests");
  assert.equal(
    urls[3],
    "http://profile-svc/internal/scripts/script%201/access-requests?status=pending"
  );
  assert.equal(
    urls[4],
    "http://profile-svc/internal/scripts/script%201/access-requests/req%201/approve"
  );
  assert.equal(
    urls[5],
    "http://profile-svc/internal/scripts/script%201/access-requests/req%202/reject"
  );
  assert.equal(
    urls[6],
    "http://script-svc/internal/scripts/script%201/view?viewerUserId=writer_01"
  );
  assert.equal(urls[7], "http://script-svc/internal/scripts/script%201/approve-viewer");
  assert.equal(urls[8], "http://script-svc/internal/scripts/script%201/visibility");
  assert.equal(headers[2]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[6]?.["x-auth-user-id"], "writer_01");
  assert.equal(JSON.parse(bodies[0] ?? "{}").scriptId, "script_1");
});
