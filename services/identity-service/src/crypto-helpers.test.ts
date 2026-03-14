import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret, decryptSecret } from "./crypto-helpers.js";

const TEST_KEY = "0".repeat(64); // 32 zero bytes as hex

function withKey<T>(key: string, fn: () => T): T {
  const original = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = key;
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = original;
    }
  }
}

test("encryptSecret then decryptSecret returns the original plaintext", () => {
  withKey(TEST_KEY, () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);
    assert.equal(decrypted, plaintext);
  });
});

test("encrypted value contains two colons (iv:authTag:ciphertext format)", () => {
  withKey(TEST_KEY, () => {
    const encrypted = encryptSecret("test-secret");
    const parts = encrypted.split(":");
    assert.equal(parts.length, 3);
    assert.equal(parts[0]!.length, IV_LENGTH_HEX);
    assert.equal(parts[1]!.length, AUTH_TAG_LENGTH_HEX);
  });
});

test("each encryption produces a different ciphertext (random IV)", () => {
  withKey(TEST_KEY, () => {
    const plaintext = "same-secret";
    const enc1 = encryptSecret(plaintext);
    const enc2 = encryptSecret(plaintext);
    assert.notEqual(enc1, enc2);
  });
});

test("decryptSecret handles plaintext fallback for legacy unencrypted secrets", () => {
  withKey(TEST_KEY, () => {
    const legacy = "abcdef1234567890"; // no colons — plaintext hex secret
    const result = decryptSecret(legacy);
    assert.equal(result, legacy);
  });
});

test("encryptSecret throws if MFA_ENCRYPTION_KEY is missing", () => {
  const original = process.env.MFA_ENCRYPTION_KEY;
  delete process.env.MFA_ENCRYPTION_KEY;
  try {
    assert.throws(
      () => encryptSecret("any"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("MFA_ENCRYPTION_KEY"));
        return true;
      }
    );
  } finally {
    if (original !== undefined) {
      process.env.MFA_ENCRYPTION_KEY = original;
    }
  }
});

test("decryptSecret throws if MFA_ENCRYPTION_KEY is missing (non-legacy format)", () => {
  const original = process.env.MFA_ENCRYPTION_KEY;
  delete process.env.MFA_ENCRYPTION_KEY;
  try {
    // A string with colons looks encrypted; decryptSecret will try to use the key
    assert.throws(
      () => decryptSecret("aabbcc:ddeeff:112233"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("MFA_ENCRYPTION_KEY"));
        return true;
      }
    );
  } finally {
    if (original !== undefined) {
      process.env.MFA_ENCRYPTION_KEY = original;
    }
  }
});

test("encryptSecret throws if MFA_ENCRYPTION_KEY is not 64 hex chars", () => {
  const original = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = "tooshort";
  try {
    assert.throws(
      () => encryptSecret("any"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("32 bytes"));
        return true;
      }
    );
  } finally {
    if (original === undefined) {
      delete process.env.MFA_ENCRYPTION_KEY;
    } else {
      process.env.MFA_ENCRYPTION_KEY = original;
    }
  }
});

// Constants for assertions
const IV_LENGTH_HEX = 24;       // 12 bytes * 2 hex chars
const AUTH_TAG_LENGTH_HEX = 32; // 16 bytes * 2 hex chars
