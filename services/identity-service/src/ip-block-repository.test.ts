import assert from "node:assert/strict";
import test from "node:test";
import { MemoryIpBlockRepository } from "./ip-block-repository.js";

test("addBlock creates a block entry", async () => {
  const repo = new MemoryIpBlockRepository();
  const block = await repo.addBlock("192.168.1.1", "Abuse", "admin_1");

  assert.ok(block.id.startsWith("ipb_"));
  assert.equal(block.ipAddress, "192.168.1.1");
  assert.equal(block.reason, "Abuse");
  assert.equal(block.blockedBy, "admin_1");
  assert.equal(block.autoBlocked, false);
  assert.equal(block.expiresAt, null);
});

test("addBlock with expiry sets expiresAt", async () => {
  const repo = new MemoryIpBlockRepository();
  const block = await repo.addBlock("10.0.0.1", "Temporary", "admin_1", 24);

  assert.ok(block.expiresAt);
  const expiresDate = new Date(block.expiresAt);
  const now = new Date();
  // Should be approximately 24 hours from now
  const diffHours = (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  assert.ok(diffHours > 23 && diffHours <= 24);
});

test("removeBlock removes existing block", async () => {
  const repo = new MemoryIpBlockRepository();
  const block = await repo.addBlock("192.168.1.1", "Abuse", "admin_1");

  const result = await repo.removeBlock(block.id);
  assert.equal(result, true);

  const blocked = await repo.isBlocked("192.168.1.1");
  assert.equal(blocked, false);
});

test("removeBlock returns false for non-existent block", async () => {
  const repo = new MemoryIpBlockRepository();
  const result = await repo.removeBlock("ipb_nonexistent");
  assert.equal(result, false);
});

test("isBlocked returns true for blocked IP", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "Abuse", "admin_1");

  const blocked = await repo.isBlocked("192.168.1.1");
  assert.equal(blocked, true);
});

test("isBlocked returns false for non-blocked IP", async () => {
  const repo = new MemoryIpBlockRepository();
  const blocked = await repo.isBlocked("10.0.0.1");
  assert.equal(blocked, false);
});

test("isBlocked returns false for expired block", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "Temporary", "admin_1", 1);

  // Manually expire the block
  const blocks = (await repo.listBlocks(1, 100, true)).blocks;
  (blocks[0] as { expiresAt: string }).expiresAt = new Date(Date.now() - 1000).toISOString();

  const blocked = await repo.isBlocked("192.168.1.1");
  assert.equal(blocked, false);
});

test("listBlocks returns active blocks", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "Abuse", "admin_1");
  await repo.addBlock("10.0.0.1", "Spam", "admin_1");

  const result = await repo.listBlocks(1, 50);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.total, 2);
});

test("listBlocks paginates correctly", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "A", "admin_1");
  await repo.addBlock("192.168.1.2", "B", "admin_1");
  await repo.addBlock("192.168.1.3", "C", "admin_1");

  const page1 = await repo.listBlocks(1, 2);
  assert.equal(page1.blocks.length, 2);
  assert.equal(page1.total, 3);

  const page2 = await repo.listBlocks(2, 2);
  assert.equal(page2.blocks.length, 1);
  assert.equal(page2.total, 3);
});

test("listBlocks excludes expired by default", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "Permanent", "admin_1");
  await repo.addBlock("10.0.0.1", "Temporary", "admin_1", 1);

  // Expire the temporary block
  const all = (await repo.listBlocks(1, 100, true)).blocks;
  const tempBlock = all.find((b) => b.ipAddress === "10.0.0.1");
  if (tempBlock) {
    (tempBlock as { expiresAt: string }).expiresAt = new Date(Date.now() - 1000).toISOString();
  }

  const result = await repo.listBlocks(1, 50, false);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0]!.ipAddress, "192.168.1.1");
});

test("listBlocks includes expired when requested", async () => {
  const repo = new MemoryIpBlockRepository();
  await repo.addBlock("192.168.1.1", "Permanent", "admin_1");
  await repo.addBlock("10.0.0.1", "Temporary", "admin_1", 1);

  // Expire the temporary block
  const all = (await repo.listBlocks(1, 100, true)).blocks;
  const tempBlock = all.find((b) => b.ipAddress === "10.0.0.1");
  if (tempBlock) {
    (tempBlock as { expiresAt: string }).expiresAt = new Date(Date.now() - 1000).toISOString();
  }

  const result = await repo.listBlocks(1, 50, true);
  assert.equal(result.blocks.length, 2);
});

test("supports IPv6 addresses", async () => {
  const repo = new MemoryIpBlockRepository();
  const block = await repo.addBlock("2001:0db8:85a3::8a2e:0370:7334", "Abuse", "admin_1");

  assert.equal(block.ipAddress, "2001:0db8:85a3::8a2e:0370:7334");
  const blocked = await repo.isBlocked("2001:0db8:85a3::8a2e:0370:7334");
  assert.equal(blocked, true);
});
