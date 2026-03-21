import assert from "node:assert/strict";
import test from "node:test";
import {
  CoverageProviderCreateRequestSchema,
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
