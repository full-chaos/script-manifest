import assert from "node:assert/strict";
import test from "node:test";
import {
  IndustryAccountCreateRequestSchema,
  IndustryAnalyticsSummarySchema,
  IndustryDigestRunSchema,
  IndustryEntitlementCheckResponseSchema,
  IndustryMandateSubmissionReviewRequestSchema,
  PartnerAnalyticsSummarySchema,
  PartnerCompetitionCreateRequestSchema,
  PartnerDraftSwapRequestSchema,
  PartnerPublishResultsRequestSchema,
  ProgramAnalyticsSummarySchema,
  ProgramCohortCreateRequestSchema,
  ProgramMentorshipMatchCreateRequestSchema,
  ProgramSessionAttendanceUpsertRequestSchema,
  ProgramSessionCreateRequestSchema,
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

test("Program workflow schemas apply defaults and enforce shape", () => {
  const cohort = ProgramCohortCreateRequestSchema.parse({
    name: "Career Lab Cohort A",
    startAt: "2026-06-01T00:00:00.000Z",
    endAt: "2026-08-01T00:00:00.000Z"
  });
  assert.equal(cohort.summary, "");
  assert.deepEqual(cohort.memberApplicationIds, []);

  const session = ProgramSessionCreateRequestSchema.parse({
    title: "Pitch Prep Workshop",
    startsAt: "2026-06-10T16:00:00.000Z",
    endsAt: "2026-06-10T18:00:00.000Z"
  });
  assert.equal(session.description, "");
  assert.equal(session.sessionType, "event");
  assert.deepEqual(session.attendeeUserIds, []);

  const attendance = ProgramSessionAttendanceUpsertRequestSchema.parse({
    userId: "writer_01",
    status: "attended"
  });
  assert.equal(attendance.notes, "");

  const mentorship = ProgramMentorshipMatchCreateRequestSchema.parse({
    matches: [{ mentorUserId: "mentor_01", menteeUserId: "writer_01" }]
  });
  assert.equal(mentorship.matches.length, 1);
  assert.equal(mentorship.matches[0]?.notes, "");

  const analytics = ProgramAnalyticsSummarySchema.parse({
    applicationsSubmitted: 12,
    applicationsUnderReview: 4,
    applicationsAccepted: 3,
    applicationsWaitlisted: 1,
    applicationsRejected: 2,
    cohortsTotal: 2,
    cohortMembersActive: 14,
    sessionsScheduled: 8,
    sessionsCompleted: 3,
    attendanceInvited: 30,
    attendanceMarked: 21,
    attendanceAttended: 18,
    attendanceRate: 0.6,
    mentorshipMatchesActive: 6,
    mentorshipMatchesCompleted: 2
  });
  assert.equal(analytics.attendanceRate, 0.6);
});

test("Partner schemas apply defaults and enforce shape", () => {
  const competition = PartnerCompetitionCreateRequestSchema.parse({
    organizerAccountId: "org_1",
    slug: "spring-fellowship-2026",
    title: "Spring Fellowship 2026",
    format: "pilot",
    genre: "drama",
    submissionOpensAt: "2026-01-01T00:00:00.000Z",
    submissionClosesAt: "2026-03-01T00:00:00.000Z"
  });
  assert.equal(competition.status, "draft");
  assert.equal(competition.description, "");

  const publish = PartnerPublishResultsRequestSchema.parse({
    results: [{ submissionId: "sub_1", placementStatus: "winner" }]
  });
  assert.equal(publish.notes, "");

  const draftSwap = PartnerDraftSwapRequestSchema.parse({
    submissionId: "sub_1",
    replacementScriptId: "script_2"
  });
  assert.equal(draftSwap.feeCents, 500);
  assert.equal(draftSwap.reason, "");

  const analytics = PartnerAnalyticsSummarySchema.parse({
    submissionsTotal: 100,
    submissionsPublished: 15,
    judgesAssigned: 8,
    evaluationsSubmitted: 220,
    normalizationRuns: 3,
    resultsPublished: 1,
    draftSwapsProcessed: 5,
    syncJobsTotal: 12,
    syncJobsFailed: 1
  });
  assert.equal(analytics.syncJobsFailed, 1);
});
