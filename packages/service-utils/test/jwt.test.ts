import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signServiceToken, verifyServiceToken } from "../src/jwt.js";

const TEST_SECRET = "test-secret-key-for-hmac-testing";

function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
}

function forgeToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payloadB64}`).digest("base64url");
  return `${header}.${payloadB64}.${sig}`;
}

describe("signServiceToken", () => {
  it("returns a JWT with three dot-separated parts", () => {
    const token = signServiceToken({ sub: "user-1", role: "writer" }, TEST_SECRET);
    const parts = token.split(".");
    assert.equal(parts.length, 3);
    assert.ok(parts[0]!.length > 0);
    assert.ok(parts[1]!.length > 0);
    assert.ok(parts[2]!.length > 0);
  });

  it("embeds sub and role in the payload", () => {
    const token = signServiceToken({ sub: "user-42", role: "admin" }, TEST_SECRET);
    const payload = decodePayload(token);
    assert.equal(payload.sub, "user-42");
    assert.equal(payload.role, "admin");
  });

  it("sets iat and exp with default 300s TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signServiceToken({ sub: "u", role: "writer" }, TEST_SECRET);
    const after = Math.floor(Date.now() / 1000);
    const payload = decodePayload(token);

    assert.ok((payload.iat as number) >= before && (payload.iat as number) <= after);
    assert.ok((payload.exp as number) >= before + 300 && (payload.exp as number) <= after + 300);
  });

  it("respects custom TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signServiceToken({ sub: "u", role: "writer" }, TEST_SECRET, 60);
    const after = Math.floor(Date.now() / 1000);
    const payload = decodePayload(token);

    assert.ok((payload.exp as number) >= before + 60 && (payload.exp as number) <= after + 60);
  });

  it("produces different tokens for different secrets", () => {
    const t1 = signServiceToken({ sub: "u", role: "writer" }, "secret-a");
    const t2 = signServiceToken({ sub: "u", role: "writer" }, "secret-b");
    assert.notEqual(t1, t2);
  });
});

describe("verifyServiceToken", () => {
  it("returns payload for a valid token", () => {
    const token = signServiceToken({ sub: "user-1", role: "admin" }, TEST_SECRET);
    const result = verifyServiceToken(token, TEST_SECRET);
    assert.ok(result !== null);
    assert.equal(result!.sub, "user-1");
    assert.equal(result!.role, "admin");
    assert.equal(typeof result!.iat, "number");
    assert.equal(typeof result!.exp, "number");
  });

  it("returns null for a token signed with a different secret", () => {
    const token = signServiceToken({ sub: "u", role: "writer" }, "correct-secret");
    assert.strictEqual(verifyServiceToken(token, "wrong-secret"), null);
  });

  it("returns null for a tampered payload", () => {
    const token = signServiceToken({ sub: "u", role: "writer" }, TEST_SECRET);
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "hacker", role: "admin", iat: 0, exp: 9999999999 }),
    ).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    assert.strictEqual(verifyServiceToken(tampered, TEST_SECRET), null);
  });

  it("returns null for an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = forgeToken(
      { sub: "u", role: "writer", iat: now - 600, exp: now - 10 },
      TEST_SECRET,
    );
    assert.strictEqual(verifyServiceToken(expiredToken, TEST_SECRET), null);
  });

  it("returns null for malformed tokens", () => {
    assert.strictEqual(verifyServiceToken("", TEST_SECRET), null);
    assert.strictEqual(verifyServiceToken("onlyonepart", TEST_SECRET), null);
    assert.strictEqual(verifyServiceToken("two.parts", TEST_SECRET), null);
    assert.strictEqual(verifyServiceToken("a.b.c.d", TEST_SECRET), null);
  });

  it("returns null for non-JSON payload", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const badPayload = Buffer.from("not-json").toString("base64url");
    const sig = createHmac("sha256", TEST_SECRET).update(`${header}.${badPayload}`).digest("base64url");
    assert.strictEqual(verifyServiceToken(`${header}.${badPayload}.${sig}`, TEST_SECRET), null);
  });

  it("roundtrips for all roles", () => {
    for (const role of ["writer", "admin", "partner", "industry_professional"] as const) {
      const token = signServiceToken({ sub: `u-${role}`, role }, TEST_SECRET);
      const result = verifyServiceToken(token, TEST_SECRET);
      assert.ok(result !== null, `should verify for role ${role}`);
      assert.equal(result!.role, role);
    }
  });
});
