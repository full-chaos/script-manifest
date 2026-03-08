import assert from "node:assert/strict";
import test from "node:test";
import { MemoryNotificationAdminRepository } from "./admin-repository.js";

test("createTemplate creates and returns a template", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const template = await repo.createTemplate({
    name: "Welcome Email",
    subject: "Welcome to Script Manifest!",
    bodyTemplate: "Hello {{name}}, welcome aboard!",
    category: "general",
    createdBy: "admin_01"
  });

  assert.ok(template.id);
  assert.equal(template.name, "Welcome Email");
  assert.equal(template.subject, "Welcome to Script Manifest!");
  assert.equal(template.bodyTemplate, "Hello {{name}}, welcome aboard!");
  assert.equal(template.category, "general");
  assert.equal(template.createdBy, "admin_01");
  assert.equal(template.status, "active");
  assert.ok(template.createdAt);
  assert.ok(template.updatedAt);
});

test("listTemplates returns all templates", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  await repo.createTemplate({
    name: "Template A",
    subject: "Subject A",
    bodyTemplate: "Body A",
    category: "general",
    createdBy: "admin_01"
  });
  await repo.createTemplate({
    name: "Template B",
    subject: "Subject B",
    bodyTemplate: "Body B",
    category: "system_maintenance",
    createdBy: "admin_01"
  });

  const templates = await repo.listTemplates();
  assert.equal(templates.length, 2);
});

test("getTemplateById returns template by id", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const created = await repo.createTemplate({
    name: "Test Template",
    subject: "Test Subject",
    bodyTemplate: "Test Body",
    category: "new_feature",
    createdBy: "admin_01"
  });

  const found = await repo.getTemplateById(created.id);
  assert.ok(found);
  assert.equal(found.id, created.id);
  assert.equal(found.name, "Test Template");
});

test("getTemplateById returns null for non-existent id", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const found = await repo.getTemplateById("nonexistent");
  assert.equal(found, null);
});

test("updateTemplateStatus updates the status", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const created = await repo.createTemplate({
    name: "Template",
    subject: "Subject",
    bodyTemplate: "Body",
    category: "general",
    createdBy: "admin_01"
  });

  const updated = await repo.updateTemplateStatus(created.id, "archived");
  assert.equal(updated, true);

  const found = await repo.getTemplateById(created.id);
  assert.ok(found);
  assert.equal(found.status, "archived");
});

test("updateTemplateStatus returns false for non-existent id", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const result = await repo.updateTemplateStatus("nonexistent", "archived");
  assert.equal(result, false);
});

test("createBroadcast creates a broadcast", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const broadcast = await repo.createBroadcast({
    subject: "Important Update",
    body: "Please read this important update.",
    audience: "all",
    sentBy: "admin_01"
  });

  assert.ok(broadcast.id);
  assert.equal(broadcast.subject, "Important Update");
  assert.equal(broadcast.body, "Please read this important update.");
  assert.equal(broadcast.audience, "all");
  assert.equal(broadcast.sentBy, "admin_01");
  assert.equal(broadcast.recipientCount, 0);
  assert.equal(broadcast.status, "pending");
  assert.equal(broadcast.sentAt, null);
  assert.ok(broadcast.createdAt);
});

test("listBroadcasts returns broadcasts with pagination", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  for (let i = 0; i < 5; i++) {
    await repo.createBroadcast({
      subject: `Broadcast ${i}`,
      body: `Body ${i}`,
      audience: "all",
      sentBy: "admin_01"
    });
  }

  const page1 = await repo.listBroadcasts({ page: 1, limit: 2 });
  assert.equal(page1.broadcasts.length, 2);
  assert.equal(page1.total, 5);

  const page2 = await repo.listBroadcasts({ page: 2, limit: 2 });
  assert.equal(page2.broadcasts.length, 2);

  const page3 = await repo.listBroadcasts({ page: 3, limit: 2 });
  assert.equal(page3.broadcasts.length, 1);
});

test("listBroadcasts filters by status", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const b1 = await repo.createBroadcast({
    subject: "Sent One",
    body: "Body",
    audience: "all",
    sentBy: "admin_01"
  });
  await repo.updateBroadcastStatus(b1.id, "sent", 100);

  await repo.createBroadcast({
    subject: "Pending One",
    body: "Body",
    audience: "all",
    sentBy: "admin_01"
  });

  const sentOnly = await repo.listBroadcasts({ status: "sent", page: 1, limit: 20 });
  assert.equal(sentOnly.broadcasts.length, 1);
  assert.equal(sentOnly.total, 1);
  assert.equal(sentOnly.broadcasts[0]!.subject, "Sent One");
});

test("updateBroadcastStatus updates status and recipient count", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const broadcast = await repo.createBroadcast({
    subject: "Test",
    body: "Body",
    audience: "all",
    sentBy: "admin_01"
  });

  const result = await repo.updateBroadcastStatus(broadcast.id, "sent", 50);
  assert.equal(result, true);

  const list = await repo.listBroadcasts({ page: 1, limit: 20 });
  const updated = list.broadcasts.find((b) => b.id === broadcast.id);
  assert.ok(updated);
  assert.equal(updated.status, "sent");
  assert.equal(updated.recipientCount, 50);
  assert.ok(updated.sentAt);
});

test("updateBroadcastStatus returns false for non-existent id", async () => {
  const repo = new MemoryNotificationAdminRepository();
  await repo.init();

  const result = await repo.updateBroadcastStatus("nonexistent", "sent");
  assert.equal(result, false);
});
