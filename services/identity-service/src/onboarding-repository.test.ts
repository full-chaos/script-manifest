import assert from "node:assert/strict";
import test from "node:test";
import { MemoryOnboardingRepository, PgOnboardingRepository } from "./onboarding-repository.js";

test("MemoryOnboardingRepository getProgress creates default progress", async () => {
  const repo = new MemoryOnboardingRepository();

  const progress = await repo.getProgress("user_1");
  assert.deepEqual(progress, {
    userId: "user_1",
    profileCompleted: false,
    firstScriptUploaded: false,
    competitionsVisited: false,
    coverageVisited: false,
  });
});

test("MemoryOnboardingRepository markStepComplete updates each supported step", async () => {
  const repo = new MemoryOnboardingRepository();

  await repo.markStepComplete("user_1", "profile_completed");
  await repo.markStepComplete("user_1", "first_script_uploaded");
  await repo.markStepComplete("user_1", "competitions_visited");
  await repo.markStepComplete("user_1", "coverage_visited");

  const progress = await repo.getProgress("user_1");
  assert.equal(progress.profileCompleted, true);
  assert.equal(progress.firstScriptUploaded, true);
  assert.equal(progress.competitionsVisited, true);
  assert.equal(progress.coverageVisited, true);
});

test("MemoryOnboardingRepository reuses progress object for existing user", async () => {
  const repo = new MemoryOnboardingRepository();

  const first = await repo.getProgress("user_1");
  await repo.markStepComplete("user_1", "profile_completed");
  const second = await repo.getProgress("user_1");

  assert.equal(first, second);
  assert.equal(second.profileCompleted, true);
});

test("MemoryOnboardingRepository throws for invalid onboarding step", async () => {
  const repo = new MemoryOnboardingRepository();

  await assert.rejects(() => repo.markStepComplete("user_1", "bad_step"), {
    message: "invalid_onboarding_step",
  });
});

test("PgOnboardingRepository throws for invalid onboarding step before DB usage", async () => {
  const repo = new PgOnboardingRepository();

  await assert.rejects(() => repo.markStepComplete("user_1", "bad_step"), {
    message: "invalid_onboarding_step",
  });
});
