import assert from "node:assert/strict";
import test from "node:test";
import { MemorySuspensionRepository } from "./suspension-repository.js";

test("suspendUser creates a suspension record", async () => {
  const repo = new MemorySuspensionRepository();
  const suspension = await repo.suspendUser("user_1", "admin_1", "spam", 7);

  assert.ok(suspension.id.startsWith("susp_"));
  assert.equal(suspension.userId, "user_1");
  assert.equal(suspension.suspendedBy, "admin_1");
  assert.equal(suspension.reason, "spam");
  assert.equal(suspension.durationDays, 7);
  assert.ok(suspension.expiresAt);
  assert.equal(suspension.liftedAt, null);
  assert.equal(suspension.liftedBy, null);
});

test("suspendUser creates permanent suspension when no durationDays", async () => {
  const repo = new MemorySuspensionRepository();
  const suspension = await repo.suspendUser("user_1", "admin_1", "ban reason");

  assert.equal(suspension.durationDays, null);
  assert.equal(suspension.expiresAt, null);
});

test("getActiveSuspension returns active suspension", async () => {
  const repo = new MemorySuspensionRepository();
  await repo.suspendUser("user_1", "admin_1", "abuse", 30);

  const active = await repo.getActiveSuspension("user_1");
  assert.ok(active);
  assert.equal(active.userId, "user_1");
  assert.equal(active.liftedAt, null);
});

test("getActiveSuspension returns null for no active suspension", async () => {
  const repo = new MemorySuspensionRepository();
  const active = await repo.getActiveSuspension("user_1");
  assert.equal(active, null);
});

test("getActiveSuspension returns null after suspension is lifted", async () => {
  const repo = new MemorySuspensionRepository();
  const suspension = await repo.suspendUser("user_1", "admin_1", "abuse", 30);
  await repo.liftSuspension(suspension.id, "admin_2");

  const active = await repo.getActiveSuspension("user_1");
  assert.equal(active, null);
});

test("getUserSuspensionHistory returns all suspensions for user", async () => {
  const repo = new MemorySuspensionRepository();
  await repo.suspendUser("user_1", "admin_1", "first offense", 7);
  await repo.suspendUser("user_1", "admin_1", "second offense", 30);
  await repo.suspendUser("user_2", "admin_1", "other user", 7);

  const history = await repo.getUserSuspensionHistory("user_1");
  assert.equal(history.length, 2);
  const reasons = history.map((s) => s.reason).sort();
  assert.deepEqual(reasons, ["first offense", "second offense"]);

  // Other user should not appear
  const user2History = await repo.getUserSuspensionHistory("user_2");
  assert.equal(user2History.length, 1);
  assert.equal(user2History[0]!.reason, "other user");
});

test("liftSuspension marks suspension as lifted", async () => {
  const repo = new MemorySuspensionRepository();
  const suspension = await repo.suspendUser("user_1", "admin_1", "abuse", 30);

  const result = await repo.liftSuspension(suspension.id, "admin_2");
  assert.equal(result, true);

  const history = await repo.getUserSuspensionHistory("user_1");
  assert.ok(history[0]!.liftedAt);
  assert.equal(history[0]!.liftedBy, "admin_2");
});

test("liftSuspension returns false for already lifted suspension", async () => {
  const repo = new MemorySuspensionRepository();
  const suspension = await repo.suspendUser("user_1", "admin_1", "abuse", 30);
  await repo.liftSuspension(suspension.id, "admin_1");

  const result = await repo.liftSuspension(suspension.id, "admin_2");
  assert.equal(result, false);
});

test("liftSuspension returns false for non-existent suspension", async () => {
  const repo = new MemorySuspensionRepository();
  const result = await repo.liftSuspension("susp_nonexistent", "admin_1");
  assert.equal(result, false);
});

test("autoExpireSuspensions lifts expired suspensions", async () => {
  const repo = new MemorySuspensionRepository();

  // Create a suspension that's already expired (by manipulating internal state)
  await repo.suspendUser("user_1", "admin_1", "spam", 1);

  // Manually set expiresAt to the past
  const history = await repo.getUserSuspensionHistory("user_1");
  (history[0] as { expiresAt: string }).expiresAt = new Date(Date.now() - 1000).toISOString();

  const count = await repo.autoExpireSuspensions();
  assert.equal(count, 1);

  const active = await repo.getActiveSuspension("user_1");
  assert.equal(active, null);
});

test("autoExpireSuspensions does not affect permanent suspensions", async () => {
  const repo = new MemorySuspensionRepository();
  await repo.suspendUser("user_1", "admin_1", "permanent ban");

  const count = await repo.autoExpireSuspensions();
  assert.equal(count, 0);

  const active = await repo.getActiveSuspension("user_1");
  assert.ok(active);
});
