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

test("api-gateway proxies competition deadline reminder", async (t) => {
  const urls: string[] = [];
  let requestBody = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      requestBody = String(options?.body ?? "");
      return jsonResponse({ accepted: true, eventId: "evt_123" }, 202);
    }) as typeof request,
    competitionDirectoryBase: "http://competition-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/competitions/comp_001/deadline-reminders",
    payload: {
      targetUserId: "writer_01",
      deadlineAt: "2026-03-01T00:00:00.000Z",
      message: "Submission closes soon"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(
    urls[0],
    "http://competition-svc/internal/competitions/comp_001/deadline-reminders"
  );
  assert.match(requestBody, /"targetUserId":"writer_01"/);
});

test("api-gateway proxies submission creation with auth", async (t) => {
  let requestBody = "";
  let authUserIdHeader = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "w@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      requestBody = String(options?.body ?? "");
      authUserIdHeader = (options?.headers as Record<string, string> | undefined)?.["x-auth-user-id"] ?? "";
      return jsonResponse({ submission: { id: "submission_1" } }, 201);
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
    headers: { authorization: "Bearer sess_test" },
    payload: {
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.match(requestBody, /"projectId":"project_01"/);
  assert.equal(authUserIdHeader, "writer_01");
});

test("api-gateway proxies script upload session creation", async (t) => {
  const urls: string[] = [];
  let requestBody = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      requestBody = String(options?.body ?? "");
      return jsonResponse({
        uploadUrl: "http://upload-svc/scripts",
        uploadFields: { key: "writer_01/script_1/latest.pdf" },
        bucket: "scripts",
        objectKey: "writer_01/script_1/latest.pdf",
        expiresAt: "2026-02-13T00:00:00.000Z"
      }, 201);
    }) as typeof request,
    scriptStorageBase: "http://script-storage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/upload-session",
    payload: {
      scriptId: "script_1",
      ownerUserId: "writer_01",
      filename: "first-draft.pdf",
      contentType: "application/pdf",
      size: 1024
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://script-storage-svc/internal/scripts/upload-session");
  assert.match(requestBody, /"scriptId":"script_1"/);
});

test("api-gateway proxies script registration", async (t) => {
  const urls: string[] = [];
  let requestBody = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      requestBody = String(options?.body ?? "");
      return jsonResponse({
        registered: true,
        script: {
          scriptId: "script_1",
          ownerUserId: "writer_01",
          objectKey: "writer_01/script_1/latest.pdf",
          filename: "first-draft.pdf",
          contentType: "application/pdf",
          size: 1024,
          registeredAt: "2026-02-13T00:00:00.000Z"
        }
      }, 201);
    }) as typeof request,
    scriptStorageBase: "http://script-storage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/register",
    payload: {
      scriptId: "script_1",
      ownerUserId: "writer_01",
      objectKey: "writer_01/script_1/latest.pdf",
      filename: "first-draft.pdf",
      contentType: "application/pdf",
      size: 1024
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://script-storage-svc/internal/scripts/register");
  assert.match(requestBody, /"objectKey":"writer_01\/script_1\/latest.pdf"/);
});

test("api-gateway proxies project co-writer endpoints", async (t) => {
  const urls: string[] = [];
  const methods: Array<string | undefined> = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "user_1", email: "w@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      methods.push(options?.method);
      return jsonResponse({ coWriters: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
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
    headers: { authorization: "Bearer sess_test" },
    payload: { coWriterUserId: "writer_02", creditOrder: 2 }
  });
  assert.equal(postResponse.statusCode, 200);
  assert.equal(urls[1], "http://profile-svc/internal/projects/project_1/co-writers");
  assert.equal(methods[1], "POST");
});

test("api-gateway proxies submission project reassignment with auth", async (t) => {
  const urls: string[] = [];
  let body = "";
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "w@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      body = String(options?.body ?? "");
      return jsonResponse({ submission: { id: "submission_1", projectId: "project_2" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "PATCH",
    url: "/api/v1/submissions/submission_1/project",
    headers: { authorization: "Bearer sess_test" },
    payload: { projectId: "project_2" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/submissions/submission_1/project");
  assert.match(body, /"projectId":"project_2"/);
});

test("api-gateway proxies oauth scaffold endpoints", async (t) => {
  const urls: string[] = [];
  const methods: Array<string | undefined> = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      methods.push(options?.method);
      return jsonResponse({ ok: true }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const start = await server.inject({
    method: "POST",
    url: "/api/v1/auth/oauth/github/start",
    payload: { redirectUri: "http://localhost:3000/auth/callback" }
  });
  assert.equal(start.statusCode, 201);
  assert.equal(urls[0], "http://identity-svc/internal/auth/oauth/github/start");
  assert.equal(methods[0], "POST");

  const complete = await server.inject({
    method: "POST",
    url: "/api/v1/auth/oauth/github/complete",
    payload: { state: "a".repeat(32), code: "b".repeat(32) }
  });
  assert.equal(complete.statusCode, 201);
  assert.equal(urls[1], "http://identity-svc/internal/auth/oauth/github/complete");
  assert.equal(methods[1], "POST");

  const callback = await server.inject({
    method: "GET",
    url: "/api/v1/auth/oauth/github/callback?state=s123&code=c123"
  });
  assert.equal(callback.statusCode, 201);
  assert.equal(urls[2], "http://identity-svc/internal/auth/oauth/github/callback?state=s123&code=c123");
  assert.equal(methods[2], "GET");
});

test("api-gateway proxies access-request workflow endpoints with auth header", async (t) => {
  const urls: string[] = [];
  const authUserIds: string[] = [];
  const methods: Array<string | undefined> = [];

  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "w@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      methods.push(options?.method);
      authUserIds.push((options?.headers as Record<string, string> | undefined)?.["x-auth-user-id"] ?? "");
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const create = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script_1/access-requests",
    headers: { authorization: "Bearer sess_1" },
    payload: { requesterUserId: "writer_01", ownerUserId: "writer_02" }
  });
  assert.equal(create.statusCode, 200);
  assert.equal(urls[0], "http://profile-svc/internal/scripts/script_1/access-requests");
  assert.equal(methods[0], "POST");

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/scripts/script_1/access-requests?status=pending",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(urls[1], "http://profile-svc/internal/scripts/script_1/access-requests?status=pending");
  assert.equal(methods[1], "GET");

  const approve = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script_1/access-requests/access_1/approve",
    headers: { authorization: "Bearer sess_1" },
    payload: { decisionReason: "ok" }
  });
  assert.equal(approve.statusCode, 200);
  assert.equal(
    urls[2],
    "http://profile-svc/internal/scripts/script_1/access-requests/access_1/approve"
  );
  assert.equal(methods[2], "POST");

  const reject = await server.inject({
    method: "POST",
    url: "/api/v1/scripts/script_1/access-requests/access_2/reject",
    headers: { authorization: "Bearer sess_1" },
    payload: { decisionReason: "nope" }
  });
  assert.equal(reject.statusCode, 200);
  assert.equal(
    urls[3],
    "http://profile-svc/internal/scripts/script_1/access-requests/access_2/reject"
  );
  assert.equal(methods[3], "POST");
  assert.deepEqual(authUserIds, ["writer_01", "writer_01", "writer_01", "writer_01"]);
});

test("api-gateway proxies placement listing/detail/verify endpoints", async (t) => {
  const urls: string[] = [];
  const methods: Array<string | undefined> = [];

  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "w@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      methods.push(options?.method);
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/placements?verificationState=pending",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(urls[0], "http://submission-svc/internal/placements?verificationState=pending");
  assert.equal(methods[0], "GET");

  const bySubmission = await server.inject({
    method: "GET",
    url: "/api/v1/submissions/sub_1/placements",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(bySubmission.statusCode, 200);
  assert.equal(urls[1], "http://submission-svc/internal/submissions/sub_1/placements");
  assert.equal(methods[1], "GET");

  const createPlacement = await server.inject({
    method: "POST",
    url: "/api/v1/submissions/sub_1/placements",
    headers: { authorization: "Bearer sess_1" },
    payload: { status: "quarterfinalist" }
  });
  assert.equal(createPlacement.statusCode, 200);
  assert.equal(urls[2], "http://submission-svc/internal/submissions/sub_1/placements");
  assert.equal(methods[2], "POST");

  const detail = await server.inject({
    method: "GET",
    url: "/api/v1/placements/place_1",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(urls[3], "http://submission-svc/internal/placements/place_1");
  assert.equal(methods[3], "GET");

  const verify = await server.inject({
    method: "POST",
    url: "/api/v1/placements/place_1/verify",
    headers: { authorization: "Bearer sess_1" },
    payload: { verificationState: "verified" }
  });
  assert.equal(verify.statusCode, 200);
  assert.equal(urls[4], "http://submission-svc/internal/placements/place_1/verify");
  assert.equal(methods[4], "POST");
});

test("api-gateway competition admin curation requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const adminHeaders: string[] = [];
  const server = buildServer({
    logger: false,
    competitionAdminAllowlist: ["admin_writer"],
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      urls.push(urlStr);
      adminHeaders.push(
        (options?.headers as Record<string, string> | undefined)?.["x-admin-user-id"] ?? ""
      );
      return jsonResponse({ ok: true }, 201);
    }) as typeof request,
    competitionDirectoryBase: "http://competition-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    payload: {
      id: "comp_1",
      title: "Admin Test",
      description: "",
      format: "feature",
      genre: "drama",
      feeUsd: 0,
      deadline: "2026-12-01T00:00:00.000Z"
    }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const allowed = await server.inject({
    method: "PUT",
    url: "/api/v1/admin/competitions/comp_1",
    headers: { "x-admin-user-id": "admin_writer" },
    payload: {
      title: "Admin Test",
      description: "",
      format: "feature",
      genre: "drama",
      feeUsd: 0,
      deadline: "2026-12-01T00:00:00.000Z"
    }
  });
  assert.equal(allowed.statusCode, 201);
  assert.equal(urls[0], "http://competition-svc/internal/admin/competitions/comp_1");
  assert.equal(adminHeaders[0], "admin_writer");
});

test("api-gateway leaderboard aggregates with format filter", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      const urlStr = String(url);
      urls.push(urlStr);

      if (urlStr.startsWith("http://profile-svc/internal/projects?")) {
        return jsonResponse({
          projects: [{ id: "project_feature_1" }]
        });
      }

      if (urlStr === "http://submission-svc/internal/submissions") {
        return jsonResponse({
          submissions: [
            {
              id: "sub_1",
              writerId: "writer_01",
              projectId: "project_feature_1",
              competitionId: "comp_1",
              status: "pending",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            },
            {
              id: "sub_2",
              writerId: "writer_01",
              projectId: "project_feature_1",
              competitionId: "comp_2",
              status: "semifinalist",
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z"
            },
            {
              id: "sub_3",
              writerId: "writer_02",
              projectId: "project_tv_1",
              competitionId: "comp_3",
              status: "winner",
              createdAt: "2026-01-03T00:00:00.000Z",
              updatedAt: "2026-01-03T00:00:00.000Z"
            }
          ]
        });
      }

      if (urlStr === "http://submission-svc/internal/placements") {
        return jsonResponse({
          placements: [
            {
              id: "place_1",
              submissionId: "sub_2",
              status: "semifinalist",
              verificationState: "verified",
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
              verifiedAt: "2026-01-02T00:00:00.000Z",
              writerId: "writer_01",
              projectId: "project_feature_1",
              competitionId: "comp_2"
            },
            {
              id: "place_2",
              submissionId: "sub_1",
              status: "quarterfinalist",
              verificationState: "pending",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              verifiedAt: null,
              writerId: "writer_01",
              projectId: "project_feature_1",
              competitionId: "comp_1"
            },
            {
              id: "place_3",
              submissionId: "sub_3",
              status: "winner",
              verificationState: "verified",
              createdAt: "2026-01-03T00:00:00.000Z",
              updatedAt: "2026-01-03T00:00:00.000Z",
              verifiedAt: "2026-01-03T00:00:00.000Z",
              writerId: "writer_02",
              projectId: "project_tv_1",
              competitionId: "comp_3"
            }
          ]
        });
      }

      return jsonResponse({ error: "unexpected_url", url: urlStr }, 404);
    }) as typeof request,
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/leaderboard?format=feature&limit=10"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().leaderboard.length, 1);
  assert.equal(response.json().leaderboard[0].writerId, "writer_01");
  assert.equal(response.json().leaderboard[0].totalScore, 9);
  assert.equal(
    urls.some((url) => url.startsWith("http://profile-svc/internal/projects?format=feature")),
    true
  );
});
