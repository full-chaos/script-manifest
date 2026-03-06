import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, authHeaders, expectOkJson, makeUnique, registerUser } from "./helpers.js";

test("compose flow: feedback lifecycle including rating dispute resolution and cancellation", async () => {
  const owner = await registerUser("feedback-lifecycle-owner");
  const reviewer = await registerUser("feedback-lifecycle-reviewer");

  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`, {
    method: "POST",
    headers: authHeaders(owner.token)
  }, 201);
  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/tokens/grant-signup`, {
    method: "POST",
    headers: authHeaders(reviewer.token)
  }, 201);

  const listing = await expectOkJson<{ listing: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/feedback/listings`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({
        projectId: makeUnique("feedback_lifecycle_project"),
        scriptId: makeUnique("feedback_lifecycle_script"),
        title: "Feedback Lifecycle Script",
        description: "Lifecycle integration test listing.",
        genre: "thriller",
        format: "feature",
        pageCount: 108
      })
    },
    201
  );
  assert.equal(listing.listing.status, "open");

  const claim = await expectOkJson<{
    listing: { id: string; status: string; claimedByUserId: string | null };
    review: { id: string; status?: string };
  }>(`${API_BASE_URL}/api/v1/feedback/listings/${encodeURIComponent(listing.listing.id)}/claim`, {
    method: "POST",
    headers: authHeaders(reviewer.token)
  }, 201);
  assert.equal(claim.listing.status, "claimed");
  assert.equal(claim.listing.claimedByUserId, reviewer.user.id);

  await expectOkJson(
    `${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(claim.review.id)}/submit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(reviewer.token)
      },
      body: JSON.stringify({
        rubric: {
          storyStructure: { score: 4, comment: "Clear setup and escalation." },
          characters: { score: 5, comment: "Distinct and memorable voices." },
          dialogue: { score: 4, comment: "Strong rhythm with occasional exposition." },
          craftVoice: { score: 4, comment: "Consistent tone and style." }
        },
        overallComment: "Great momentum with room to tighten middle beats."
      })
    },
    200
  );

  await expectOkJson(`${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(claim.review.id)}/rate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(owner.token)
    },
    body: JSON.stringify({
      score: 5,
      comment: "Detailed, specific, and useful notes."
    })
  }, 201);

  const rating = await expectOkJson<{ rating: { score: number; comment: string } }>(
    `${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(claim.review.id)}/rating`,
    { method: "GET" },
    200
  );
  assert.equal(rating.rating.score, 5);

  const dispute = await expectOkJson<{ dispute: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/feedback/reviews/${encodeURIComponent(claim.review.id)}/dispute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({ reason: "Need clarification on one section." })
    },
    201
  );
  assert.equal(dispute.dispute.status, "open");

  const resolved = await expectOkJson<{ dispute: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/feedback/disputes/${encodeURIComponent(dispute.dispute.id)}/resolve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({
        status: "resolved_for_filer",
        resolutionNote: "Clarification provided and accepted."
      })
    },
    200
  );
  assert.equal(resolved.dispute.status, "resolved_for_filer");

  const disputes = await expectOkJson<{ disputes: Array<{ id: string; status: string }> }>(
    `${API_BASE_URL}/api/v1/feedback/disputes?limit=25&offset=0`,
    {
      method: "GET",
      headers: authHeaders(owner.token)
    },
    200
  );
  assert.ok(disputes.disputes.some((entry) => entry.id === dispute.dispute.id && entry.status === "resolved_for_filer"));

  const reviews = await expectOkJson<{ reviews: Array<{ id: string; status: string }> }>(
    `${API_BASE_URL}/api/v1/feedback/reviews?limit=25&offset=0&reviewerUserId=${encodeURIComponent(reviewer.user.id)}`,
    {
      method: "GET",
      headers: authHeaders(reviewer.token)
    },
    200
  );
  assert.ok(reviews.reviews.some((entry) => entry.id === claim.review.id));

  const reputation = await expectOkJson<{ reputation: { userId: string; totalReviews: number; averageRating: number | null } }>(
    `${API_BASE_URL}/api/v1/feedback/reputation/${encodeURIComponent(reviewer.user.id)}`,
    { method: "GET" },
    200
  );
  assert.equal(reputation.reputation.userId, reviewer.user.id);
  assert.ok(reputation.reputation.totalReviews >= 1);
  assert.equal(reputation.reputation.averageRating, 5);

  const ownerTransactions = await expectOkJson<{ transactions: Array<{ id: string }> }>(
    `${API_BASE_URL}/api/v1/feedback/tokens/transactions`,
    {
      method: "GET",
      headers: authHeaders(owner.token)
    },
    200
  );
  assert.ok(ownerTransactions.transactions.length >= 1);

  const reviewerTransactions = await expectOkJson<{ transactions: Array<{ id: string }> }>(
    `${API_BASE_URL}/api/v1/feedback/tokens/transactions`,
    {
      method: "GET",
      headers: authHeaders(reviewer.token)
    },
    200
  );
  assert.ok(reviewerTransactions.transactions.length >= 1);

  const cancellableListing = await expectOkJson<{ listing: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/feedback/listings`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(owner.token)
      },
      body: JSON.stringify({
        projectId: makeUnique("feedback_lifecycle_project_cancel"),
        scriptId: makeUnique("feedback_lifecycle_script_cancel"),
        title: "Feedback Lifecycle Cancellable Listing",
        description: "Listing cancelled by owner in lifecycle integration test.",
        genre: "drama",
        format: "feature",
        pageCount: 95
      })
    },
    201
  );

  const cancelled = await expectOkJson<{ listing: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/feedback/listings/${encodeURIComponent(cancellableListing.listing.id)}/cancel`,
    {
      method: "POST",
      headers: authHeaders(owner.token)
    },
    200
  );
  assert.equal(cancelled.listing.status, "cancelled");
});
