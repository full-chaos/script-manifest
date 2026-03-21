import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAuthUserId, readHeader, readBearerToken } from "../src/headerHelpers.js";
import type { FastifyRequest } from "fastify";

function fakeRequest(headers: Record<string, string | string[] | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

// ── getAuthUserId ───────────────────────────────────────────────────────────

describe("getAuthUserId", () => {
  it("returns the x-auth-user-id header value", () => {
    const req = fakeRequest({ "x-auth-user-id": "user-42" });
    assert.equal(getAuthUserId(req), "user-42");
  });

  it("returns null when header is missing", () => {
    const req = fakeRequest({});
    assert.strictEqual(getAuthUserId(req), null);
  });

  it("returns null when header is an empty string", () => {
    const req = fakeRequest({ "x-auth-user-id": "" });
    assert.strictEqual(getAuthUserId(req), null);
  });

  it("returns null when header is an array (multiple values)", () => {
    const req = fakeRequest({ "x-auth-user-id": ["a", "b"] as unknown as string });
    assert.strictEqual(getAuthUserId(req), null);
  });
});

// ── readHeader ──────────────────────────────────────────────────────────────

describe("readHeader", () => {
  it("returns the value for a present header", () => {
    const req = fakeRequest({ "x-custom": "value-123" });
    assert.equal(readHeader(req, "x-custom"), "value-123");
  });

  it("returns undefined for a missing header", () => {
    const req = fakeRequest({});
    assert.strictEqual(readHeader(req, "x-missing"), undefined);
  });

  it("returns undefined for an empty string header", () => {
    const req = fakeRequest({ "x-empty": "" });
    assert.strictEqual(readHeader(req, "x-empty"), undefined);
  });

  it("returns undefined for array-valued header", () => {
    const req = fakeRequest({ "x-arr": ["a", "b"] as unknown as string });
    assert.strictEqual(readHeader(req, "x-arr"), undefined);
  });
});

// ── readBearerToken ─────────────────────────────────────────────────────────

describe("readBearerToken", () => {
  it("extracts token from a valid Bearer header", () => {
    assert.equal(readBearerToken("Bearer abc123"), "abc123");
  });

  it("is case-insensitive for the scheme", () => {
    assert.equal(readBearerToken("bearer abc123"), "abc123");
    assert.equal(readBearerToken("BEARER abc123"), "abc123");
    assert.equal(readBearerToken("BeArEr abc123"), "abc123");
  });

  it("returns null for undefined input", () => {
    assert.strictEqual(readBearerToken(undefined), null);
  });

  it("returns null for empty string", () => {
    assert.strictEqual(readBearerToken(""), null);
  });

  it("returns null for non-Bearer scheme", () => {
    assert.strictEqual(readBearerToken("Basic abc123"), null);
  });

  it("returns null when token part is missing", () => {
    assert.strictEqual(readBearerToken("Bearer"), null);
    assert.strictEqual(readBearerToken("Bearer "), null);
  });
});
