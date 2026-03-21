import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveServiceSecret,
  makeServiceHeaders,
  verifyInternalToken,
  requireServiceToken,
  requireAdminServiceToken,
} from "../src/serviceHeaders.js";
import { signServiceToken } from "../src/jwt.js";

const TEST_SECRET = "test-service-token-secret";

describe("resolveServiceSecret", () => {
  let original: string | undefined;

  beforeEach(() => { original = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = original;
  });

  it("returns the secret when set", () => {
    process.env.SERVICE_TOKEN_SECRET = "my-secret";
    assert.equal(resolveServiceSecret(), "my-secret");
  });

  it("returns null when not set", () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    assert.strictEqual(resolveServiceSecret(), null);
  });
});

describe("makeServiceHeaders", () => {
  let original: string | undefined;

  beforeEach(() => { original = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = original;
  });

  it("includes content-type header", () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    const headers = makeServiceHeaders("user-1");
    assert.equal(headers["content-type"], "application/json");
  });

  it("includes x-service-token when secret is set", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const headers = makeServiceHeaders("user-1", "writer");
    assert.ok("x-service-token" in headers);
    assert.ok(headers["x-service-token"]!.split(".").length === 3);
  });

  it("omits x-service-token when secret is not set", () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    const headers = makeServiceHeaders("user-1");
    assert.ok(!("x-service-token" in headers));
  });

  it("defaults role to writer", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const headers = makeServiceHeaders("user-1");
    const payload = verifyInternalToken(headers);
    assert.ok(payload !== null);
    assert.equal(payload!.role, "writer");
  });

  it("uses provided role", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const headers = makeServiceHeaders("user-1", "admin");
    const payload = verifyInternalToken(headers);
    assert.ok(payload !== null);
    assert.equal(payload!.role, "admin");
  });

  it("merges extra headers", () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    const headers = makeServiceHeaders("user-1", "writer", { "x-custom": "val" });
    assert.equal(headers["x-custom"], "val");
    assert.equal(headers["content-type"], "application/json");
  });
});

describe("verifyInternalToken", () => {
  let original: string | undefined;

  beforeEach(() => { original = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = original;
  });

  it("returns payload for a valid token", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const token = signServiceToken({ sub: "svc", role: "admin" }, TEST_SECRET);
    const result = verifyInternalToken({ "x-service-token": token });
    assert.ok(result !== null);
    assert.equal(result!.sub, "svc");
  });

  it("returns null when header is missing", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    assert.strictEqual(verifyInternalToken({}), null);
  });

  it("returns null when header is not a string", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    assert.strictEqual(verifyInternalToken({ "x-service-token": 123 }), null);
  });

  it("returns null when secret is not set", () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    const token = signServiceToken({ sub: "svc", role: "admin" }, TEST_SECRET);
    assert.strictEqual(verifyInternalToken({ "x-service-token": token }), null);
  });
});

describe("requireServiceToken", () => {
  let original: string | undefined;

  beforeEach(() => { original = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = original;
  });

  it("returns true for valid token", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const token = signServiceToken({ sub: "svc", role: "writer" }, TEST_SECRET);
    assert.ok(requireServiceToken({ "x-service-token": token }));
  });

  it("returns false for missing token", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    assert.ok(!requireServiceToken({}));
  });
});

describe("requireAdminServiceToken", () => {
  let original: string | undefined;

  beforeEach(() => { original = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = original;
  });

  it("returns user ID from x-auth-user-id for admin token", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const token = signServiceToken({ sub: "svc-account", role: "admin" }, TEST_SECRET);
    const result = requireAdminServiceToken({
      "x-service-token": token,
      "x-auth-user-id": "admin-user-42",
    });
    assert.equal(result, "admin-user-42");
  });

  it("falls back to token sub when x-auth-user-id is missing", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const token = signServiceToken({ sub: "svc-account", role: "admin" }, TEST_SECRET);
    const result = requireAdminServiceToken({ "x-service-token": token });
    assert.equal(result, "svc-account");
  });

  it("returns null for non-admin role", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const token = signServiceToken({ sub: "svc", role: "writer" }, TEST_SECRET);
    assert.strictEqual(requireAdminServiceToken({ "x-service-token": token }), null);
  });

  it("returns null for missing token", () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    assert.strictEqual(requireAdminServiceToken({}), null);
  });
});
