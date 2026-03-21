import assert from "node:assert/strict";
import test from "node:test";
import type { AdminUser } from "@script-manifest/contracts";
import { MemoryAdminRepository } from "./admin-repository.js";

function seedUsers(repo: MemoryAdminRepository): void {
  const users: AdminUser[] = [
    {
      id: "user_1",
      email: "alice@example.com",
      displayName: "Alice",
      role: "writer",
      accountStatus: "active",
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "user_2",
      email: "admin@example.com",
      displayName: "Admin Bob",
      role: "admin",
      accountStatus: "suspended",
      emailVerified: false,
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  Reflect.set(repo as object, "users", users);
}

test("MemoryAdminRepository listUsers filters and paginates", async () => {
  const repo = new MemoryAdminRepository();
  seedUsers(repo);

  const filtered = await repo.listUsers({ search: "admin", role: "admin", status: "suspended", page: 1, limit: 10 });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.users.length, 1);
  assert.equal(filtered.users[0]?.id, "user_2");

  const paged = await repo.listUsers({ page: 2, limit: 1 });
  assert.equal(paged.total, 2);
  assert.equal(paged.users.length, 1);
  assert.equal(paged.users[0]?.id, "user_2");
});

test("MemoryAdminRepository getUserById returns details or null", async () => {
  const repo = new MemoryAdminRepository();
  seedUsers(repo);

  const found = await repo.getUserById("user_1");
  assert.ok(found);
  assert.equal(found.id, "user_1");
  assert.equal(found.sessionCount, 0);
  assert.equal(found.reportCount, 0);

  const missing = await repo.getUserById("missing");
  assert.equal(missing, null);
});

test("MemoryAdminRepository updateUserStatus and updateUserRole return update result", async () => {
  const repo = new MemoryAdminRepository();
  seedUsers(repo);

  assert.equal(await repo.updateUserStatus("user_1", "suspended"), true);
  assert.equal(await repo.updateUserRole("user_1", "admin"), true);
  assert.equal(await repo.updateUserStatus("missing", "active"), false);
  assert.equal(await repo.updateUserRole("missing", "writer"), false);

  const updated = await repo.getUserById("user_1");
  assert.ok(updated);
  assert.equal(updated.accountStatus, "suspended");
  assert.equal(updated.role, "admin");
});

test("MemoryAdminRepository audit log entry creation and filtering", async () => {
  const repo = new MemoryAdminRepository();

  await repo.createAuditLogEntry({
    adminUserId: "admin_1",
    action: "user_suspend",
    targetType: "user",
    targetId: "user_1",
    details: { reason: "abuse" },
  });
  await repo.createAuditLogEntry({
    adminUserId: "admin_2",
    action: "user_unsuspend",
    targetType: "user",
    targetId: "user_2",
  });

  const filtered = await repo.listAuditLogEntries({ adminUserId: "admin_1", page: 1, limit: 20 });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.entries.length, 1);
  assert.equal(filtered.entries[0]?.action, "user_suspend");
});

test("MemoryAdminRepository report flow and metrics", async () => {
  const repo = new MemoryAdminRepository();
  seedUsers(repo);

  const report = await repo.createContentReport("user_1", "script", "script_1", "spam", "bad content");
  const pending = await repo.listContentReports({ status: "pending", page: 1, limit: 20 });
  assert.equal(pending.total, 1);
  assert.equal(pending.reports[0]?.id, report.id);

  const found = await repo.getContentReportById(report.id);
  assert.ok(found);

  const resolved = await repo.resolveContentReport(report.id, "admin_1", "removed", "resolved");
  assert.ok(resolved);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedByUserId, "admin_1");

  const metrics = await repo.getUserMetrics();
  assert.equal(metrics.totalUsers, 2);
  assert.equal(metrics.activeUsers30d, 2);
  assert.equal(metrics.pendingReports, 0);
});
