import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE_URL,
  authHeaders,
  expectOkJson,
  registerUser
} from "./helpers.js";

test("compose flow: feedback listing claim submit rate and reputation", async () => {
  const owner = await registerUser("feedback-owner");
  const reviewer = await registerUser("feedback-reviewer");

  await expectOkJson(
    `${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`,
    {
      method: "POST",
      headers: authHeaders(owner.token)
    },
    201
  );
  await expectOkJson(
    `${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`,
    {
      method: "POST",
      headers: authHeaders(reviewer.token)
    },
    201
  );

  const listingResponse = await expectOkJson<{ listing: { id: string } }>(
    `${API_BASE_URL}/api/v1/feedback/listings`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({
        projectId: "project_feedback_flow",
        scriptId: "script_feedback_flow",
        title: "Feedback Flow Script",
        description: "Used by compose integration tests.",
        genre: "drama",
        format: "feature",
        pageCount: 105
      })
    },
    201
  );
  const listingId = listingResponse.listing.id;

  const claimResponse = await expectOkJson<{
    listing: { id: string; status: string };
    review: { id: string };
  }>(
    `${API_BASE_URL}/api/v1/feedback/listings/${encodeURIComponent(listingId)}/claim`,
    {
      method: "POST",
      headers: authHeaders(reviewer.token)
    },
    201
  );
  assert.equal(claimResponse.listing.status, "claimed");
  const reviewId = claimResponse.review.id;

  await expectOkJson(
    `${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(reviewId)}/submit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(reviewer.token)
      },
      body: JSON.stringify({
        rubric: {
          storyStructure: { score: 4, comment: "Solid narrative progression." },
          characters: { score: 4, comment: "Characters have distinct goals." },
          dialogue: { score: 5, comment: "Dialogue feels natural and specific." },
          craftVoice: { score: 4, comment: "Voice is consistent and confident." }
        },
        overallComment: "Strong draft with clear next-step revisions."
      })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(reviewId)}/rate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({
        score: 5,
        comment: "Helpful and specific feedback."
      })
    },
    201
  );

  const reputation = await expectOkJson<{
    reputation: { userId: string; totalReviews: number; averageRating: number | null };
  }>(`${API_BASE_URL}/api/v1/feedback/reputation/${encodeURIComponent(reviewer.user.id)}`, {
    method: "GET"
  });

  assert.equal(reputation.reputation.userId, reviewer.user.id);
  assert.ok(reputation.reputation.totalReviews >= 1);
  assert.equal(reputation.reputation.averageRating, 5);

  const reviewerBalance = await expectOkJson<{ balance: number }>(
    `${API_BASE_URL}/api/v1/feedback/tokens/balance`,
    {
      method: "GET",
      headers: authHeaders(reviewer.token)
    }
  );
  assert.ok(reviewerBalance.balance >= 4);
});
