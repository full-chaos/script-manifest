import assert from "node:assert/strict";
import test from "node:test";
import { PRIVILEGED_AUDIT_ACTIONS } from "../src/auditEvents.js";

test("privileged audit taxonomy covers PMF trust actions", () => {
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("provider.review"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("coverage.dispute.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("feedback.dispute.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.prestige.update"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.recompute"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.flag.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.appeal.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("competition.moderate"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("notification.admin.send"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("feature_flag.create"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("feature_flag.update"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("feature_flag.delete"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("user.suspend"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("security.ip_block.update"));
});
