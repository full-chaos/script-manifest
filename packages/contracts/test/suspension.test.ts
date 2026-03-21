import assert from "node:assert/strict";
import test from "node:test";
import {
  SuspensionReasonSchema,
  SuspendUserRequestSchema,
  LiftSuspensionRequestSchema,
  UserSuspensionSchema
} from "../src/suspension.js";

test("SuspensionReasonSchema accepts known reasons", () => {
  const parsed = SuspensionReasonSchema.parse("fraud");
  assert.equal(parsed, "fraud");
});

test("SuspendUserRequestSchema accepts temporary and permanent payloads", () => {
  const temporary = SuspendUserRequestSchema.safeParse({ reason: "abuse", durationDays: 30 });
  const permanent = SuspendUserRequestSchema.safeParse({ reason: "abuse" });
  assert.equal(temporary.success, true);
  assert.equal(permanent.success, true);
});

test("SuspendUserRequestSchema rejects durations above max", () => {
  const result = SuspendUserRequestSchema.safeParse({ reason: "abuse", durationDays: 366 });
  assert.equal(result.success, false);
});

test("LiftSuspensionRequestSchema requires suspension id", () => {
  const result = LiftSuspensionRequestSchema.safeParse({ suspensionId: "" });
  assert.equal(result.success, false);
});

test("UserSuspensionSchema validates date fields", () => {
  const parsed = UserSuspensionSchema.parse({
    id: "sus_1",
    userId: "user_1",
    reason: "fraud",
    suspendedBy: "admin_1",
    durationDays: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    liftedAt: null,
    liftedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(parsed.id, "sus_1");
});
