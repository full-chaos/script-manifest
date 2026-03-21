import assert from "node:assert/strict";
import test from "node:test";
import {
  FeedbackListingCreateRequestSchema,
  FeedbackListingFiltersSchema,
  FeedbackReviewSubmitRequestSchema,
  ReviewerRatingCreateRequestSchema,
  FeedbackDisputeResolveRequestSchema
} from "../src/feedback.js";

test("FeedbackListingCreateRequestSchema accepts valid listing input", () => {
  const parsed = FeedbackListingCreateRequestSchema.parse({
    projectId: "proj_1",
    scriptId: "script_1",
    title: "Need notes",
    genre: "drama",
    format: "feature",
    pageCount: 105
  });
  assert.equal(parsed.pageCount, 105);
});

test("FeedbackListingFiltersSchema trims values and coerces pagination", () => {
  const parsed = FeedbackListingFiltersSchema.parse({
    genre: " drama ",
    limit: "25",
    offset: "4"
  });
  assert.equal(parsed.genre, "drama");
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.offset, 4);
});

test("FeedbackReviewSubmitRequestSchema rejects rubric scores outside range", () => {
  const result = FeedbackReviewSubmitRequestSchema.safeParse({
    rubric: {
      storyStructure: { score: 6, comment: "x" },
      characters: { score: 5, comment: "x" },
      dialogue: { score: 5, comment: "x" },
      craftVoice: { score: 5, comment: "x" }
    },
    overallComment: "good"
  });
  assert.equal(result.success, false);
});

test("ReviewerRatingCreateRequestSchema rejects rating above max", () => {
  const result = ReviewerRatingCreateRequestSchema.safeParse({ score: 7, comment: "too high" });
  assert.equal(result.success, false);
});

test("FeedbackDisputeResolveRequestSchema accepts valid statuses only", () => {
  const valid = FeedbackDisputeResolveRequestSchema.safeParse({ status: "dismissed", resolutionNote: "no action" });
  const invalid = FeedbackDisputeResolveRequestSchema.safeParse({ status: "open", resolutionNote: "bad" });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
