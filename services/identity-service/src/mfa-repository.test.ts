import assert from "node:assert/strict";
import test from "node:test";
import { MemoryMfaRepository } from "./mfa-repository.js";
import { hashBackupCode } from "./totp.js";

function createRepo(): MemoryMfaRepository {
  return new MemoryMfaRepository();
}

test("init is a no-op for memory repo", async () => {
  const repo = createRepo();
  await repo.init(); // should not throw
});

test("getMfaStatus returns disabled for unknown user", async () => {
  const repo = createRepo();
  const status = await repo.getMfaStatus("user_unknown");
  assert.equal(status.enabled, false);
  assert.equal(status.enabledAt, null);
});

test("setupMfa stores a pending secret", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "secret123");
  const pending = await repo.getPendingSetup("user_1");
  assert.equal(pending, "secret123");
});

test("getPendingSetup returns null after enabling", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "secret123");
  await repo.enableMfa("user_1", ["hash1", "hash2"]);
  const pending = await repo.getPendingSetup("user_1");
  assert.equal(pending, null);
});

test("getPendingSetup returns null for unknown user", async () => {
  const repo = createRepo();
  const pending = await repo.getPendingSetup("user_unknown");
  assert.equal(pending, null);
});

test("enableMfa sets enabled status and stores backup codes", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "secret123");
  await repo.enableMfa("user_1", ["hash1", "hash2", "hash3"]);

  const status = await repo.getMfaStatus("user_1");
  assert.equal(status.enabled, true);
  assert.ok(status.enabledAt);

  const codes = await repo.getBackupCodes("user_1");
  assert.equal(codes.length, 3);
});

test("getSecret returns stored secret", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "abcdef1234567890");
  const secret = await repo.getSecret("user_1");
  assert.equal(secret, "abcdef1234567890");
});

test("getSecret returns null for unknown user", async () => {
  const repo = createRepo();
  const secret = await repo.getSecret("user_unknown");
  assert.equal(secret, null);
});

test("consumeBackupCode consumes a valid code", async () => {
  const repo = createRepo();
  const code = "abcd1234";
  const codeHash = hashBackupCode(code);
  await repo.setupMfa("user_1", "secret");
  await repo.enableMfa("user_1", [codeHash]);

  const consumed = await repo.consumeBackupCode("user_1", codeHash);
  assert.equal(consumed, true);

  // Second attempt should fail
  const again = await repo.consumeBackupCode("user_1", codeHash);
  assert.equal(again, false);
});

test("consumeBackupCode returns false for wrong code", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "secret");
  await repo.enableMfa("user_1", [hashBackupCode("abcd1234")]);

  const result = await repo.consumeBackupCode("user_1", hashBackupCode("wrong"));
  assert.equal(result, false);
});

test("consumeBackupCode returns false for unknown user", async () => {
  const repo = createRepo();
  const result = await repo.consumeBackupCode("user_unknown", "anyhash");
  assert.equal(result, false);
});

test("disableMfa removes all MFA data", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "secret");
  await repo.enableMfa("user_1", ["hash1"]);

  await repo.disableMfa("user_1");

  const status = await repo.getMfaStatus("user_1");
  assert.equal(status.enabled, false);

  const secret = await repo.getSecret("user_1");
  assert.equal(secret, null);

  const codes = await repo.getBackupCodes("user_1");
  assert.equal(codes.length, 0);
});

test("disableMfa is safe for user without MFA", async () => {
  const repo = createRepo();
  await repo.disableMfa("user_unknown"); // should not throw
});

test("setupMfa replaces existing pending setup", async () => {
  const repo = createRepo();
  await repo.setupMfa("user_1", "first_secret");
  await repo.setupMfa("user_1", "second_secret");

  const pending = await repo.getPendingSetup("user_1");
  assert.equal(pending, "second_secret");
});

test("getBackupCodes returns empty array for user without MFA", async () => {
  const repo = createRepo();
  const codes = await repo.getBackupCodes("user_unknown");
  assert.deepEqual(codes, []);
});
