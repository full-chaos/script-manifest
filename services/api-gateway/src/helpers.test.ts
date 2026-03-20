import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyReply } from "fastify";
import type { request } from "undici";
import { verifyServiceToken } from "@script-manifest/service-utils";
import {
  addAuthUserIdHeader,
  buildQuerySuffix,
  clearAuthCache,
  clearAuthCacheByUserId,
  copyAuthHeader,
  getUserAuthFromToken,
  getUserIdFromAuth,
  parseAllowlist,
  proxyJsonRequest,
  resolveAdminByRole,
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
  const previousSecret = process.env.SERVICE_TOKEN_SECRET;
  process.env.SERVICE_TOKEN_SECRET = "test-secret";

  try {
    assert.deepEqual(copyAuthHeader(undefined), {});
    assert.deepEqual(copyAuthHeader("Bearer sess_1"), { authorization: "Bearer sess_1" });
    assert.deepEqual(addAuthUserIdHeader({ a: "b" }, null), { a: "b" });

    const forwarded = addAuthUserIdHeader({ a: "b" }, "writer_1");
    assert.equal(forwarded.a, "b");
    assert.equal(forwarded["x-auth-user-id"], "writer_1");
    assert.ok(forwarded["x-service-token"]);

    const tokenPayload = verifyServiceToken(forwarded["x-service-token"], "test-secret");
    assert.ok(tokenPayload);
    assert.equal(tokenPayload.sub, "writer_1");
    assert.equal(tokenPayload.role, "writer");

    assert.equal(readHeaderValue({ authorization: "Bearer sess_1" }, "authorization"), "Bearer sess_1");
    assert.equal(readHeaderValue({ authorization: "" }, "authorization"), undefined);
    assert.deepEqual(parseAllowlist(" admin_1,admin_2 , ,admin_3 "), [
      "admin_1",
      "admin_2",
      "admin_3"
    ]);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.SERVICE_TOKEN_SECRET;
    } else {
      process.env.SERVICE_TOKEN_SECRET = previousSecret;
    }
  }
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
    return jsonResponse({ user: { id: "writer_42", role: "writer" } }, 200);
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
  clearAuthCache();
  const requestFn = (async () => jsonResponse({ user: { id: "admin_from_auth", role: "admin" } }, 200)) as typeof request;

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
  // CHAOS-584: proxyJsonRequest now passes raw text through (no double-serialization)
  assert.equal(capture.payload, '{"ok":true}');
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

// ── Auth cache tests (CHAOS-581) ────────────────────────────────────

test("auth cache returns cached result on second call without hitting identity service", async () => {
  clearAuthCache();
  let callCount = 0;
  const requestFn = (async () => {
    callCount++;
    return jsonResponse({ user: { id: "cached_user", role: "writer" } }, 200);
  }) as typeof request;

  const first = await getUserIdFromAuth(requestFn, "http://identity", "Bearer cache_test_1");
  assert.equal(first, "cached_user");
  assert.equal(callCount, 1);

  const second = await getUserIdFromAuth(requestFn, "http://identity", "Bearer cache_test_1");
  assert.equal(second, "cached_user");
  assert.equal(callCount, 1, "second call should use cache, not call identity service");
});

test("auth cache returns null from cache for failed auth without re-calling identity", async () => {
  clearAuthCache();
  let callCount = 0;
  const requestFn = (async () => {
    callCount++;
    return jsonResponse({}, 401);
  }) as typeof request;

  const first = await getUserIdFromAuth(requestFn, "http://identity", "Bearer fail_cache_1");
  assert.equal(first, null);
  assert.equal(callCount, 1);

  const second = await getUserIdFromAuth(requestFn, "http://identity", "Bearer fail_cache_1");
  assert.equal(second, null);
  assert.equal(callCount, 1, "cached null should prevent re-calling identity service");
});

test("clearAuthCache resets cache so next call hits identity service", async () => {
  clearAuthCache();
  let callCount = 0;
  const requestFn = (async () => {
    callCount++;
    return jsonResponse({ user: { id: "writer_clear", role: "writer" } }, 200);
  }) as typeof request;

  await getUserIdFromAuth(requestFn, "http://identity", "Bearer clear_test_1");
  assert.equal(callCount, 1);

  clearAuthCache();

  await getUserIdFromAuth(requestFn, "http://identity", "Bearer clear_test_1");
  assert.equal(callCount, 2, "after clearing cache, identity service should be called again");
});

test("auth cache uses different entries for different tokens", async () => {
  clearAuthCache();
  let lastCalledAuth = "";
  const requestFn = (async (_url, options) => {
    lastCalledAuth = (options?.headers as Record<string, string> | undefined)?.authorization ?? "";
    if (lastCalledAuth === "Bearer user_a") {
      return jsonResponse({ user: { id: "user_a", role: "writer" } }, 200);
    }
    return jsonResponse({ user: { id: "user_b", role: "writer" } }, 200);
  }) as typeof request;

  const a = await getUserIdFromAuth(requestFn, "http://identity", "Bearer user_a");
  const b = await getUserIdFromAuth(requestFn, "http://identity", "Bearer user_b");
  assert.equal(a, "user_a");
  assert.equal(b, "user_b");

  // Both should now be cached — calling with swapped requestFn should still return original
  const aCached = await getUserIdFromAuth(
    (async () => jsonResponse({ user: { id: "wrong", role: "writer" } }, 200)) as typeof request,
    "http://identity",
    "Bearer user_a"
  );
  assert.equal(aCached, "user_a", "cached entry for token A should be returned");
});

test("clearAuthCacheByUserId evicts entries for the target user only", async () => {
  clearAuthCache();

  let callCount = 0;
  const requestFn = (async (_url, options) => {
    callCount++;
    const authorization = (options?.headers as Record<string, string> | undefined)?.authorization ?? "";
    if (authorization === "Bearer token_a") {
      return jsonResponse({ user: { id: "user_a", role: "writer" } }, 200);
    }
    if (authorization === "Bearer token_b") {
      return jsonResponse({ user: { id: "user_b", role: "writer" } }, 200);
    }
    return jsonResponse({}, 401);
  }) as typeof request;

  const userAFirst = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_a");
  const userBFirst = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_b");
  assert.equal(userAFirst, "user_a");
  assert.equal(userBFirst, "user_b");
  assert.equal(callCount, 2);

  clearAuthCacheByUserId("user_a");

  const userASecond = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_a");
  assert.equal(userASecond, "user_a");
  assert.equal(callCount, 3, "user_a entry should be evicted and re-fetched");

  const userBSecond = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_b");
  assert.equal(userBSecond, "user_b");
  assert.equal(callCount, 3, "user_b entry should remain cached");
});

test("clearAuthCacheByUserId is a no-op when user has no cached entries", async () => {
  clearAuthCache();

  let callCount = 0;
  const requestFn = (async () => {
    callCount++;
    return jsonResponse({ user: { id: "user_a", role: "writer" } }, 200);
  }) as typeof request;

  const first = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_a");
  assert.equal(first, "user_a");
  assert.equal(callCount, 1);

  clearAuthCacheByUserId("nonexistent_user");

  const second = await getUserIdFromAuth(requestFn, "http://identity", "Bearer token_a");
  assert.equal(second, "user_a");
  assert.equal(callCount, 1, "non-matching user eviction should not evict existing entries");
});

test("getUserAuthFromToken returns user id and role", async () => {
  const result = await getUserAuthFromToken(
    (async () => jsonResponse({ user: { id: "admin_1", role: "admin" } }, 200)) as typeof request,
    "http://identity",
    "Bearer role_test"
  );

  assert.deepEqual(result, { userId: "admin_1", role: "admin" });
});

test("resolveAdminByRole allows header and admin role only", async () => {
  const headerResult = await resolveAdminByRole(
    (async () => {
      throw new Error("requestFn should not be called when x-admin-user-id is present");
    }) as typeof request,
    "http://identity",
    { "x-admin-user-id": "forwarded_admin" }
  );
  assert.equal(headerResult, "forwarded_admin");

  const adminResult = await resolveAdminByRole(
    (async () => jsonResponse({ user: { id: "admin_auth", role: "admin" } }, 200)) as typeof request,
    "http://identity",
    { authorization: "Bearer admin_token" }
  );
  assert.equal(adminResult, "admin_auth");

  const writerResult = await resolveAdminByRole(
    (async () => jsonResponse({ user: { id: "writer_auth", role: "writer" } }, 200)) as typeof request,
    "http://identity",
    { authorization: "Bearer writer_token" }
  );
  assert.equal(writerResult, null);
});

// ── proxyJsonRequest passthrough tests (CHAOS-584) ──────────────────

test("proxyJsonRequest passes through content-type from upstream headers", async () => {
  const headers: Record<string, string> = {};
  const capture: { statusCode?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) { capture.statusCode = code; return this; },
    send(payload: unknown) { capture.payload = payload; return this; },
    header(name: string, value: string) { headers[name] = value; return this; }
  } as unknown as FastifyReply;

  const requestFn = (async () => ({
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: { text: async () => '{"data":"hello"}', json: async () => ({ data: "hello" }) }
  })) as unknown as typeof request;

  await proxyJsonRequest(reply, requestFn, "http://svc/test", { method: "GET" });
  assert.equal(capture.statusCode, 200);
  assert.equal(capture.payload, '{"data":"hello"}');
  assert.equal(headers["content-type"], "application/json; charset=utf-8");
});

test("proxyJsonRequest sends null for empty upstream body", async () => {
  const capture: { statusCode?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) { capture.statusCode = code; return this; },
    send(payload: unknown) { capture.payload = payload; return this; },
    header() { return this; }
  } as unknown as FastifyReply;

  const requestFn = (async () => ({
    statusCode: 204,
    body: { text: async () => "", json: async () => null }
  })) as unknown as typeof request;

  await proxyJsonRequest(reply, requestFn, "http://svc/test", { method: "DELETE" });
  assert.equal(capture.statusCode, 204);
  assert.equal(capture.payload, null);
});
