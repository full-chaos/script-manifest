import assert from "node:assert/strict";
import test from "node:test";
import { MemoryFeatureFlagRepository } from "./feature-flag-repository.js";

test("createFlag creates a new flag", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  const flag = await repo.createFlag("dark_mode", "Enable dark mode", "admin_1");
  assert.equal(flag.key, "dark_mode");
  assert.equal(flag.description, "Enable dark mode");
  assert.equal(flag.enabled, false);
  assert.equal(flag.rolloutPct, 0);
  assert.deepEqual(flag.userAllowlist, []);
  assert.equal(flag.updatedBy, "admin_1");
  assert.ok(flag.createdAt);
  assert.ok(flag.updatedAt);
});

test("createFlag throws on duplicate key", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("dark_mode", "Enable dark mode", "admin_1");
  await assert.rejects(
    () => repo.createFlag("dark_mode", "Duplicate", "admin_1"),
    { message: "flag_already_exists" }
  );
});

test("listFlags returns sorted flags", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("zebra_feature", "Z feature", "admin_1");
  await repo.createFlag("alpha_feature", "A feature", "admin_1");

  const flags = await repo.listFlags();
  assert.equal(flags.length, 2);
  assert.equal(flags[0]!.key, "alpha_feature");
  assert.equal(flags[1]!.key, "zebra_feature");
});

test("getFlagByKey returns the flag or null", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("test_flag", "Test", "admin_1");

  const found = await repo.getFlagByKey("test_flag");
  assert.ok(found);
  assert.equal(found.key, "test_flag");

  const notFound = await repo.getFlagByKey("nonexistent");
  assert.equal(notFound, null);
});

test("updateFlag updates flag properties", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("test_flag", "Test", "admin_1");

  const updated = await repo.updateFlag("test_flag", {
    enabled: true,
    description: "Updated description",
    rolloutPct: 50,
    userAllowlist: ["user_1", "user_2"]
  }, "admin_2");

  assert.ok(updated);
  assert.equal(updated.enabled, true);
  assert.equal(updated.description, "Updated description");
  assert.equal(updated.rolloutPct, 50);
  assert.deepEqual(updated.userAllowlist, ["user_1", "user_2"]);
  assert.equal(updated.updatedBy, "admin_2");
});

test("updateFlag returns null for nonexistent flag", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  const result = await repo.updateFlag("nonexistent", { enabled: true }, "admin_1");
  assert.equal(result, null);
});

test("deleteFlag removes the flag", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("test_flag", "Test", "admin_1");
  const deleted = await repo.deleteFlag("test_flag");
  assert.equal(deleted, true);

  const found = await repo.getFlagByKey("test_flag");
  assert.equal(found, null);
});

test("deleteFlag returns false for nonexistent flag", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  const deleted = await repo.deleteFlag("nonexistent");
  assert.equal(deleted, false);
});

test("evaluateFlags returns false for disabled flags", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("disabled_flag", "Disabled", "admin_1");
  const result = await repo.evaluateFlags("user_1");
  assert.equal(result.disabled_flag, false);
});

test("evaluateFlags returns true for allowlisted user", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("beta_flag", "Beta", "admin_1");
  await repo.updateFlag("beta_flag", {
    enabled: true,
    userAllowlist: ["user_1"]
  }, "admin_1");

  const result = await repo.evaluateFlags("user_1");
  assert.equal(result.beta_flag, true);

  const otherResult = await repo.evaluateFlags("user_2");
  // Not allowlisted and rollout is 0
  assert.equal(otherResult.beta_flag, false);
});

test("evaluateFlags returns true for 100% rollout", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("full_rollout", "Full", "admin_1");
  await repo.updateFlag("full_rollout", {
    enabled: true,
    rolloutPct: 100
  }, "admin_1");

  const result = await repo.evaluateFlags("user_1");
  assert.equal(result.full_rollout, true);
});

test("evaluateFlags handles partial rollout deterministically", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("partial_flag", "Partial", "admin_1");
  await repo.updateFlag("partial_flag", {
    enabled: true,
    rolloutPct: 50
  }, "admin_1");

  // The result should be deterministic for the same userId + flagKey
  const result1 = await repo.evaluateFlags("user_abc");
  const result2 = await repo.evaluateFlags("user_abc");
  assert.equal(result1.partial_flag, result2.partial_flag);
});

test("evaluateFlags without userId returns false for partial rollout", async () => {
  const repo = new MemoryFeatureFlagRepository();
  await repo.init();

  await repo.createFlag("partial_flag", "Partial", "admin_1");
  await repo.updateFlag("partial_flag", {
    enabled: true,
    rolloutPct: 50
  }, "admin_1");

  const result = await repo.evaluateFlags();
  // Without userId, partial rollout returns false
  assert.equal(result.partial_flag, false);
});
