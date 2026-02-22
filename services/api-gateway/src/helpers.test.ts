import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyReply } from "fastify";
import type { request } from "undici";
import {
  addAuthUserIdHeader,
  buildQuerySuffix,
  copyAuthHeader,
  getUserIdFromAuth,
  parseAllowlist,
  proxyJsonRequest,
  readHeaderValue,
  resolveAdminUserId,
  safeJsonParse
} from "./helpers.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as unknown as RequestResult;
}

function textResponse(payload: string, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => {
        throw new Error("json_not_available");
      },
      text: async () => payload
    }
  } as unknown as RequestResult;
}

function createReplyCapture() {
  const capture: { statusCode?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) {
      capture.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      capture.payload = payload;
      return this;
    }
  } as unknown as FastifyReply;
  return { reply, capture };
}

test("buildQuerySuffix includes strings and arrays only", () => {
  const suffix = buildQuerySuffix({
    writerId: "writer_1",
    status: ["pending", "winner"],
    skip: undefined,
    ignored: 42 as unknown as string
  });

  assert.equal(suffix, "?writerId=writer_1&status=pending&status=winner");
  assert.equal(buildQuerySuffix({}), "");
});

test("header helpers keep auth behavior deterministic", () => {
  assert.deepEqual(copyAuthHeader(undefined), {});
  assert.deepEqual(copyAuthHeader("Bearer sess_1"), { authorization: "Bearer sess_1" });
  assert.deepEqual(addAuthUserIdHeader({ a: "b" }, null), { a: "b" });
  assert.deepEqual(addAuthUserIdHeader({ a: "b" }, "writer_1"), {
    a: "b",
    "x-auth-user-id": "writer_1"
  });
  assert.equal(readHeaderValue({ authorization: "Bearer sess_1" }, "authorization"), "Bearer sess_1");
  assert.equal(readHeaderValue({ authorization: "" }, "authorization"), undefined);
  assert.deepEqual(parseAllowlist(" admin_1,admin_2 , ,admin_3 "), [
    "admin_1",
    "admin_2",
    "admin_3"
  ]);
});

test("getUserIdFromAuth returns null when authorization is missing", async () => {
  let called = false;
  const requestFn = (async () => {
    called = true;
    return jsonResponse({});
  }) as typeof request;

  const result = await getUserIdFromAuth(requestFn, "http://identity", undefined);
  assert.equal(result, null);
  assert.equal(called, false);
});

test("getUserIdFromAuth returns parsed user id for valid auth response", async () => {
  let calledUrl = "";
  let calledAuth = "";
  const requestFn = (async (url, options) => {
    calledUrl = String(url);
    calledAuth = (options?.headers as Record<string, string> | undefined)?.authorization ?? "";
    return jsonResponse({ user: { id: "writer_42" } }, 200);
  }) as typeof request;

  const result = await getUserIdFromAuth(requestFn, "http://identity", "Bearer sess_abc");
  assert.equal(result, "writer_42");
  assert.equal(calledUrl, "http://identity/internal/auth/me");
  assert.equal(calledAuth, "Bearer sess_abc");
});

test("getUserIdFromAuth returns null for non-200 or malformed responses", async () => {
  const non200 = await getUserIdFromAuth(
    (async () => jsonResponse({ user: { id: "writer_1" } }, 401)) as typeof request,
    "http://identity",
    "Bearer sess_1"
  );
  assert.equal(non200, null);

  const missingUser = await getUserIdFromAuth(
    (async () => jsonResponse({ user: {} }, 200)) as typeof request,
    "http://identity",
    "Bearer sess_1"
  );
  assert.equal(missingUser, null);
});

test("resolveAdminUserId prefers explicit admin header when allowlisted", async () => {
  const requestFn = (async () => {
    throw new Error("requestFn should not be called when admin header is allowlisted");
  }) as typeof request;

  const result = await resolveAdminUserId(
    requestFn,
    "http://identity",
    { "x-admin-user-id": "admin_01", authorization: "Bearer sess_1" },
    new Set(["admin_01"])
  );

  assert.equal(result, "admin_01");
});

test("resolveAdminUserId falls back to auth identity lookup", async () => {
  const requestFn = (async () => jsonResponse({ user: { id: "admin_from_auth" } }, 200)) as typeof request;

  const allowlisted = await resolveAdminUserId(
    requestFn,
    "http://identity",
    { authorization: "Bearer sess_1" },
    new Set(["admin_from_auth"])
  );
  assert.equal(allowlisted, "admin_from_auth");

  const rejected = await resolveAdminUserId(
    requestFn,
    "http://identity",
    { authorization: "Bearer sess_1" },
    new Set(["someone_else"])
  );
  assert.equal(rejected, null);
});

test("proxyJsonRequest forwards response body and request id header", async () => {
  const { reply, capture } = createReplyCapture();
  let requestIdHeader = "";
  const requestFn = (async (_url, options) => {
    requestIdHeader =
      (options?.headers as Record<string, string> | undefined)?.["x-request-id"] ?? "";
    return jsonResponse({ ok: true }, 201);
  }) as typeof request;

  await proxyJsonRequest(
    reply,
    requestFn,
    "http://service/internal/resource",
    { method: "POST", headers: { authorization: "Bearer sess_1" }, body: '{"name":"x"}' },
    "req_123"
  );

  assert.equal(requestIdHeader, "req_123");
  assert.equal(capture.statusCode, 201);
  assert.deepEqual(capture.payload, { ok: true });
});

test("proxyJsonRequest preserves plain text and returns 502 on upstream failure", async () => {
  const plainTextReply = createReplyCapture();
  await proxyJsonRequest(
    plainTextReply.reply,
    (async () => textResponse("non-json-body", 418)) as typeof request,
    "http://service/internal/resource",
    { method: "GET" }
  );
  assert.equal(plainTextReply.capture.statusCode, 418);
  assert.equal(plainTextReply.capture.payload, "non-json-body");

  const failedReply = createReplyCapture();
  await proxyJsonRequest(
    failedReply.reply,
    (async () => {
      throw new Error("connection_refused");
    }) as typeof request,
    "http://service/internal/resource",
    { method: "GET" }
  );
  assert.equal(failedReply.capture.statusCode, 502);
  assert.deepEqual(failedReply.capture.payload, {
    error: "upstream_unavailable",
    detail: "connection_refused"
  });
});

test("safeJsonParse returns parsed object or original payload", () => {
  assert.deepEqual(safeJsonParse('{"ok":true}'), { ok: true });
  assert.equal(safeJsonParse("no-json"), "no-json");
});
