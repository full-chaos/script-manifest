import assert from "node:assert/strict";
import test from "node:test";
import {
  IndustryAccountCreateRequestSchema,
  IndustryEntitlementCheckResponseSchema,
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

test("IndustryAccountCreateRequestSchema applies safe optional URL defaults", () => {
  const parsed = IndustryAccountCreateRequestSchema.parse({
    companyName: "Film Studio",
    roleTitle: "Development Executive",
    professionalEmail: "exec@example.com"
  });

  assert.equal(parsed.websiteUrl, "");
  assert.equal(parsed.linkedinUrl, "");
  assert.equal(parsed.imdbUrl, "");
});

test("IndustryEntitlementCheckResponseSchema enforces entitlement response shape", () => {
  const parsed = IndustryEntitlementCheckResponseSchema.parse({
    writerUserId: "writer_01",
    industryAccountId: "industry_acct_01",
    accessLevel: "download",
    canView: true,
    canDownload: true
  });

  assert.equal(parsed.accessLevel, "download");
  assert.equal(parsed.canDownload, true);
});
