import assert from "node:assert/strict";
import test from "node:test";
import { MemoryScriptStorageRepository } from "./repository.js";

test("MemoryScriptStorageRepository addApprovedViewer deduplicates and upgrades visibility", async () => {
  const repo = new MemoryScriptStorageRepository();
  await repo.registerScript({
    scriptId: "script_1",
    ownerUserId: "writer_1",
    objectKey: "writer_1/script_1.pdf",
    filename: "script.pdf",
    contentType: "application/pdf",
    size: 100,
    registeredAt: new Date().toISOString(),
    visibility: "private",
    approvedViewers: []
  });

  await repo.addApprovedViewer("script_1", "reader_1");
  await repo.addApprovedViewer("script_1", "reader_1");

  const script = await repo.getScript("script_1");
  assert.ok(script);
  assert.equal(script.visibility, "approved_only");
  assert.deepEqual(script.approvedViewers, ["reader_1"]);
});
