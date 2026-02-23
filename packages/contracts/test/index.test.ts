import assert from "node:assert/strict";
import test from "node:test";
import {
  IndustryAccountCreateRequestSchema,
  IndustryAnalyticsSummarySchema,
  IndustryDigestRunSchema,
  IndustryEntitlementCheckResponseSchema,
  IndustryMandateSubmissionReviewRequestSchema,
  IndustryWeeklyDigestRunRequestSchema,
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

test("Industry review and digest schemas apply defaults and enforce output shape", () => {
  const review = IndustryMandateSubmissionReviewRequestSchema.parse({
    status: "under_review"
  });
  assert.equal(review.editorialNotes, "");
  assert.equal(review.forwardedTo, "");

  const runRequest = IndustryWeeklyDigestRunRequestSchema.parse({});
  assert.equal(runRequest.limit, 10);
  assert.deepEqual(runRequest.overrideWriterIds, []);

  const digest = IndustryDigestRunSchema.parse({
    id: "digest_1",
    industryAccountId: "industry_account_1",
    generatedByUserId: "industry_01",
    windowStart: "2026-02-16T00:00:00.000Z",
    windowEnd: "2026-02-23T00:00:00.000Z",
    candidateCount: 2,
    recommendations: [
      { writerId: "writer_01", projectId: "project_01", reason: "Strong fit", source: "algorithm" }
    ],
    overrideWriterIds: [],
    notes: "",
    createdAt: "2026-02-23T00:00:00.000Z"
  });
  assert.equal(digest.recommendations.length, 1);

  const analytics = IndustryAnalyticsSummarySchema.parse({
    downloadsTotal: 1,
    uniqueWritersDownloaded: 1,
    listsTotal: 2,
    notesTotal: 2,
    mandatesOpen: 1,
    submissionsForwarded: 1,
    digestsGenerated: 1
  });
  assert.equal(analytics.mandatesOpen, 1);
});
