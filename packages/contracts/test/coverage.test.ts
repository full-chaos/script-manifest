import assert from "node:assert/strict";
import test from "node:test";
import {
  CoverageProviderSchema,
  CoverageProviderCreateRequestSchema,
  CoverageProviderFiltersSchema,
  getProviderBadgeForVerificationState,
  ProviderVerificationRequestSchema,
  CoverageOrderFiltersSchema,
  CoverageDeliveryCreateRequestSchema,
  CoverageDisputeResolveRequestSchema
} from "../src/coverage.js";

test("CoverageProviderCreateRequestSchema accepts valid provider payload", () => {
  const parsed = CoverageProviderCreateRequestSchema.parse({
    displayName: "Provider One",
    bio: "Experienced analyst",
    specialties: ["drama", "comedy"]
  });
  assert.equal(parsed.specialties.length, 2);
});

test("CoverageProviderCreateRequestSchema rejects too many specialties", () => {
  const specialties = Array.from({ length: 21 }, (_, i) => `genre-${i}`);
  const result = CoverageProviderCreateRequestSchema.safeParse({
    displayName: "Provider",
    bio: "Bio",
    specialties
  });
  assert.equal(result.success, false);
});

test("CoverageProviderSchema requires server-derived badge and verification fields", () => {
  const parsed = CoverageProviderSchema.parse({
    id: "provider-1",
    userId: "user-1",
    displayName: "Verified Reader",
    bio: "Coverage specialist",
    specialties: ["drama"],
    status: "active",
    stripeAccountId: "acct_123",
    stripeOnboardingComplete: true,
    verificationState: "verified",
    verifiedAt: "2026-05-24T12:00:00.000Z",
    verifiedByUserId: "admin-1",
    verificationNotes: "Portfolio and references reviewed.",
    verificationUpdatedAt: "2026-05-24T12:00:00.000Z",
    badge: {
      kind: "verified_provider",
      label: "Verified provider",
      description: "Script Manifest reviewed this provider's identity and coverage history.",
      verifiedAt: "2026-05-24T12:00:00.000Z"
    },
    avgRating: 4.8,
    totalOrdersCompleted: 12,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-24T12:00:00.000Z"
  });

  assert.equal(parsed.verificationState, "verified");
  assert.equal(parsed.badge.kind, "verified_provider");
});

test("ProviderVerificationRequestSchema validates states, reason length, and checklist defaults", () => {
  const parsed = ProviderVerificationRequestSchema.parse({ state: "unverified" });
  assert.deepEqual(parsed.checklist, []);

  const invalidState = ProviderVerificationRequestSchema.safeParse({ state: "active" });
  assert.equal(invalidState.success, false);

  const invalidChecklist = ProviderVerificationRequestSchema.safeParse({
    state: "verified",
    checklist: [""]
  });
  assert.equal(invalidChecklist.success, false);
});

test("getProviderBadgeForVerificationState derives buyer-safe badge copy", () => {
  const verified = getProviderBadgeForVerificationState("verified", "2026-05-24T12:00:00.000Z");
  const unverified = getProviderBadgeForVerificationState("unverified", null);
  const rejected = getProviderBadgeForVerificationState("rejected", null);
  const suspended = getProviderBadgeForVerificationState("suspended", null);

  assert.equal(verified.kind, "verified_provider");
  assert.equal(verified.verifiedAt, "2026-05-24T12:00:00.000Z");
  assert.equal(unverified.kind, "unverified_provider");
  assert.equal(rejected.kind, "verification_rejected");
  assert.equal(suspended.kind, "provider_suspended");
});

test("CoverageProviderFiltersSchema accepts verificationState without overloading operational status", () => {
  const parsed = CoverageProviderFiltersSchema.parse({
    status: "active",
    verificationState: "verified",
    limit: "25"
  });

  assert.equal(parsed.status, "active");
  assert.equal(parsed.verificationState, "verified");
  assert.equal(parsed.limit, 25);
});

test("CoverageOrderFiltersSchema coerces limit and offset", () => {
  const parsed = CoverageOrderFiltersSchema.parse({
    limit: "10",
    offset: "2"
  });
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.offset, 2);
});

test("CoverageDeliveryCreateRequestSchema rejects invalid score", () => {
  const result = CoverageDeliveryCreateRequestSchema.safeParse({
    summary: "summary",
    score: 101
  });
  assert.equal(result.success, false);
});

test("CoverageDisputeResolveRequestSchema requires admin notes", () => {
  const valid = CoverageDisputeResolveRequestSchema.safeParse({
    status: "resolved_partial",
    adminNotes: "partial refund",
    refundAmountCents: 1000
  });
  const invalid = CoverageDisputeResolveRequestSchema.safeParse({
    status: "resolved_refund",
    adminNotes: ""
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
