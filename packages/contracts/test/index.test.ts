import assert from "node:assert/strict";
import test from "node:test";
import {
  ProjectDraftCreateRequestSchema,
  WriterProfileSchema,
  WriterProfileUpdateRequestSchema
} from "../src/index.js";

test("WriterProfileSchema applies safe defaults for optional profile fields", () => {
  const parsed = WriterProfileSchema.parse({
    id: "writer_1",
    displayName: "Writer One",
    representationStatus: "unrepresented"
  });

  assert.equal(parsed.bio, "");
  assert.deepEqual(parsed.genres, []);
  assert.deepEqual(parsed.demographics, []);
  assert.equal(parsed.headshotUrl, "");
  assert.equal(parsed.customProfileUrl, "");
  assert.equal(parsed.isSearchable, true);
});

test("WriterProfileUpdateRequestSchema rejects malformed URLs but allows empty URL values", () => {
  assert.throws(() =>
    WriterProfileUpdateRequestSchema.parse({
      headshotUrl: "not-a-valid-url"
    })
  );

  const parsed = WriterProfileUpdateRequestSchema.parse({
    headshotUrl: "",
    customProfileUrl: ""
  });
  assert.equal(parsed.headshotUrl, "");
  assert.equal(parsed.customProfileUrl, "");
});

test("ProjectDraftCreateRequestSchema fills default fields for draft creation", () => {
  const parsed = ProjectDraftCreateRequestSchema.parse({
    scriptId: "script_1",
    versionLabel: "v2"
  });

  assert.equal(parsed.changeSummary, "");
  assert.equal(parsed.pageCount, 0);
  assert.equal(parsed.setPrimary, true);
});
