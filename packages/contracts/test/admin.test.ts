import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminUserListRequestSchema,
  AdminUserUpdateRequestSchema,
  ContentReportCreateRequestSchema,
  ModerationActionRequestSchema,
  ModerationQueueRequestSchema,
  PlatformMetricsSchema,
  AuditLogListRequestSchema
} from "../src/admin.js";

test("AdminUserListRequestSchema coerces paging values", () => {
  const parsed = AdminUserListRequestSchema.parse({ page: "3", limit: "50", status: "active" });
  assert.equal(parsed.page, 3);
  assert.equal(parsed.limit, 50);
});

test("AdminUserUpdateRequestSchema rejects invalid suspensionDurationDays", () => {
  const result = AdminUserUpdateRequestSchema.safeParse({ suspensionDurationDays: 500 });
  assert.equal(result.success, false);
});

test("ContentReportCreateRequestSchema validates enum values", () => {
  const valid = ContentReportCreateRequestSchema.safeParse({
    contentType: "script",
    contentId: "script_1",
    reason: "plagiarism",
    description: "copied pages"
  });
  const invalid = ContentReportCreateRequestSchema.safeParse({
    contentType: "script",
    contentId: "script_1",
    reason: "invalid_reason"
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("ModerationActionRequestSchema enforces reason and duration bounds", () => {
  const valid = ModerationActionRequestSchema.safeParse({
    actionType: "suspension",
    reason: "Terms violation",
    suspensionDurationDays: 30
  });
  const invalid = ModerationActionRequestSchema.safeParse({
    actionType: "suspension",
    reason: "",
    suspensionDurationDays: 366
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("ModerationQueueRequestSchema and AuditLogListRequestSchema apply defaults", () => {
  const queue = ModerationQueueRequestSchema.parse({});
  const audit = AuditLogListRequestSchema.parse({});
  assert.equal(queue.page, 1);
  assert.equal(queue.limit, 20);
  assert.equal(audit.page, 1);
  assert.equal(audit.limit, 50);
});

test("PlatformMetricsSchema rejects negative counters", () => {
  const result = PlatformMetricsSchema.safeParse({
    totalUsers: 10,
    activeUsers30d: -1,
    totalProjects: 4,
    openDisputes: 0,
    pendingAppeals: 0,
    pendingFlags: 0,
    pendingReports: 1
  });
  assert.equal(result.success, false);
});
