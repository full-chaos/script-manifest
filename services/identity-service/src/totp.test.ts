import assert from "node:assert/strict";
import test from "node:test";
import {
  generateSecret,
  generateTotpCode,
  verifyTotpCode,
  hexToBase32,
  generateOtpauthUrl,
  generateBackupCodes,
  hashBackupCode
} from "./totp.js";

test("generateSecret returns 40 hex chars (160 bits)", () => {
  const secret = generateSecret();
  assert.equal(secret.length, 40);
  assert.match(secret, /^[0-9a-f]{40}$/);
});

test("generateSecret produces unique values", () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.notEqual(a, b);
});

test("generateTotpCode returns a 6-digit string", () => {
  const secret = generateSecret();
  const code = generateTotpCode(secret);
  assert.equal(code.length, 6);
  assert.match(code, /^\d{6}$/);
});

test("generateTotpCode is deterministic for the same secret and time", () => {
  const secret = "0123456789abcdef0123456789abcdef01234567";
  const time = 1700000000;
  const code1 = generateTotpCode(secret, time);
  const code2 = generateTotpCode(secret, time);
  assert.equal(code1, code2);
});

test("generateTotpCode changes with different time steps", () => {
  const secret = generateSecret();
  const code1 = generateTotpCode(secret, 1700000000);
  const code2 = generateTotpCode(secret, 1700000060); // 2 time steps later
  assert.notEqual(code1, code2);
});

test("verifyTotpCode accepts current code", () => {
  const secret = generateSecret();
  const code = generateTotpCode(secret);
  assert.ok(verifyTotpCode(secret, code));
});

test("verifyTotpCode rejects wrong code", () => {
  const secret = generateSecret();
  assert.equal(verifyTotpCode(secret, "000000"), false);
});

test("verifyTotpCode accepts code from adjacent time window", () => {
  const secret = generateSecret();
  const now = Date.now() / 1000;
  // Generate a code for the previous time step
  const prevCode = generateTotpCode(secret, now - 30);
  // With window=1, should accept
  assert.ok(verifyTotpCode(secret, prevCode, 1));
});

test("verifyTotpCode rejects code outside window", () => {
  const secret = generateSecret();
  const now = Date.now() / 1000;
  // Generate a code 3 time steps in the past
  const oldCode = generateTotpCode(secret, now - 90);
  // With window=1, should reject
  assert.equal(verifyTotpCode(secret, oldCode, 1), false);
});

test("hexToBase32 converts correctly", () => {
  // Known test vector: hex "48656c6c6f" = "Hello" = base32 "JBSWY3DP"
  // Actually, let's compute from a simpler example:
  // 0x00 = base32 "AA======"" but we strip padding
  // Test with a known 20-byte secret
  const hex = "48656c6c6f"; // "Hello"
  const result = hexToBase32(hex);
  assert.equal(result, "JBSWY3DP");
});

test("hexToBase32 handles full TOTP secret length", () => {
  const secret = "0123456789abcdef0123456789abcdef01234567";
  const base32 = hexToBase32(secret);
  // Should be 32 chars for a 20-byte (160-bit) secret
  assert.equal(base32.length, 32);
  assert.match(base32, /^[A-Z2-7]+$/);
});

test("generateOtpauthUrl produces valid otpauth URL", () => {
  const secret = generateSecret();
  const url = generateOtpauthUrl(secret, "test@example.com");
  assert.ok(url.startsWith("otpauth://totp/"));
  assert.ok(url.includes("ScriptManifest"));
  assert.ok(url.includes("test%40example.com"));
  assert.ok(url.includes("secret="));
  assert.ok(url.includes("algorithm=SHA1"));
  assert.ok(url.includes("digits=6"));
  assert.ok(url.includes("period=30"));
});

test("generateOtpauthUrl uses custom issuer", () => {
  const secret = generateSecret();
  const url = generateOtpauthUrl(secret, "test@example.com", "MyApp");
  assert.ok(url.includes("MyApp"));
});

test("generateBackupCodes produces the requested count", () => {
  const codes = generateBackupCodes(10);
  assert.equal(codes.length, 10);
});

test("generateBackupCodes produces unique 8-char hex codes", () => {
  const codes = generateBackupCodes(10);
  const unique = new Set(codes);
  assert.equal(unique.size, 10);
  for (const code of codes) {
    assert.equal(code.length, 8);
    assert.match(code, /^[0-9a-f]{8}$/);
  }
});

test("hashBackupCode produces consistent SHA-256 hash", () => {
  const hash1 = hashBackupCode("abcd1234");
  const hash2 = hashBackupCode("abcd1234");
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64); // SHA-256 hex
});

test("hashBackupCode produces different hashes for different codes", () => {
  const hash1 = hashBackupCode("abcd1234");
  const hash2 = hashBackupCode("efgh5678");
  assert.notEqual(hash1, hash2);
});
