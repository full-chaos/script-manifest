import assert from "node:assert/strict";
import test from "node:test";
import {
  STATUS_WEIGHTS,
  DEFAULT_PRESTIGE_MULTIPLIERS,
  CONFIDENCE_THRESHOLD,
  computeTimeDecay,
  computeVerificationMultiplier,
  computeConfidenceFactor,
  computePlacementScore,
  assignTier,
  generateBadgeLabel,
  detectDuplicateSubmissions
} from "./scoring.js";

// ── Time decay ──

test("computeTimeDecay returns 1.0 for same-day", () => {
  const now = "2026-01-15T00:00:00.000Z";
  assert.equal(computeTimeDecay(now, now), 1.0);
});

test("computeTimeDecay returns ~0.5 at 365 days", () => {
  const placed = "2025-01-15T00:00:00.000Z";
  const now = "2026-01-15T00:00:00.000Z";
  const decay = computeTimeDecay(placed, now);
  assert.ok(Math.abs(decay - 0.5) < 0.01, `expected ~0.5, got ${decay}`);
});

test("computeTimeDecay returns 1.0 for future placement", () => {
  const placed = "2026-02-01T00:00:00.000Z";
  const now = "2026-01-01T00:00:00.000Z";
  assert.equal(computeTimeDecay(placed, now), 1.0);
});

// ── Verification multiplier ──

test("computeVerificationMultiplier returns correct values", () => {
  assert.equal(computeVerificationMultiplier("verified"), 1.0);
  assert.equal(computeVerificationMultiplier("pending"), 0.5);
  assert.equal(computeVerificationMultiplier("rejected"), 0);
});

// ── Confidence factor ──

test("computeConfidenceFactor starts at 0.6 for 1 evaluation", () => {
  const cf = computeConfidenceFactor(1);
  assert.ok(Math.abs(cf - 0.6) < 0.01, `expected ~0.6, got ${cf}`);
});

test("computeConfidenceFactor is ~0.8 at 3 evaluations", () => {
  const cf = computeConfidenceFactor(3);
  assert.ok(Math.abs(cf - 0.8) < 0.01, `expected ~0.8, got ${cf}`);
});

test("computeConfidenceFactor caps at 1.0 at threshold", () => {
  assert.equal(computeConfidenceFactor(CONFIDENCE_THRESHOLD), 1.0);
  assert.equal(computeConfidenceFactor(CONFIDENCE_THRESHOLD + 5), 1.0);
});

// ── Full placement score ──

test("computePlacementScore multiplies all factors", () => {
  const score = computePlacementScore({
    status: "winner",
    prestigeMultiplier: 2.0,
    verificationState: "verified",
    placementDate: "2026-01-01T00:00:00.000Z",
    now: "2026-01-01T00:00:00.000Z",
    evaluationCount: 10
  });
  // winner(10) * prestige(2.0) * verified(1.0) * sameDay(1.0) * fullConfidence(1.0) = 20
  assert.equal(score, 20);
});

test("computePlacementScore zeroes out for rejected verification", () => {
  const score = computePlacementScore({
    status: "finalist",
    prestigeMultiplier: 3.0,
    verificationState: "rejected",
    placementDate: "2026-01-01T00:00:00.000Z",
    now: "2026-01-01T00:00:00.000Z",
    evaluationCount: 5
  });
  assert.equal(score, 0);
});

test("computePlacementScore halves for pending verification", () => {
  const score = computePlacementScore({
    status: "winner",
    prestigeMultiplier: 1.0,
    verificationState: "pending",
    placementDate: "2026-01-01T00:00:00.000Z",
    now: "2026-01-01T00:00:00.000Z",
    evaluationCount: 10
  });
  // winner(10) * 1.0 * pending(0.5) * 1.0 * 1.0 = 5
  assert.equal(score, 5);
});

// ── Tier assignment ──

test("assignTier returns correct tiers at boundaries", () => {
  assert.equal(assignTier(1, 100), "top_1");
  assert.equal(assignTier(2, 100), "top_2");
  assert.equal(assignTier(10, 100), "top_10");
  assert.equal(assignTier(25, 100), "top_25");
  assert.equal(assignTier(26, 100), null);
});

test("assignTier returns null for empty / invalid input", () => {
  assert.equal(assignTier(0, 100), null);
  assert.equal(assignTier(1, 0), null);
});

// ── Badge label ──

test("generateBadgeLabel formats correctly", () => {
  assert.equal(
    generateBadgeLabel("finalist", "Austin Film Festival", 2025),
    "Finalist - Austin Film Festival 2025"
  );
  assert.equal(
    generateBadgeLabel("winner", "Sundance", 2026),
    "Winner - Sundance 2026"
  );
});

test("generateBadgeLabel returns empty for pending status", () => {
  assert.equal(generateBadgeLabel("pending", "Test", 2026), "");
});

// ── Duplicate detection ──

test("detectDuplicateSubmissions flags writers with multiple projects in same competition", () => {
  const dupes = detectDuplicateSubmissions([
    { writerId: "w1", competitionId: "c1", projectId: "p1" },
    { writerId: "w1", competitionId: "c1", projectId: "p2" },
    { writerId: "w2", competitionId: "c1", projectId: "p3" }
  ]);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0]!.writerId, "w1");
  assert.equal(dupes[0]!.competitionId, "c1");
  assert.deepEqual(dupes[0]!.duplicateProjectIds, ["p1", "p2"]);
});

test("detectDuplicateSubmissions returns empty when no duplicates", () => {
  const dupes = detectDuplicateSubmissions([
    { writerId: "w1", competitionId: "c1", projectId: "p1" },
    { writerId: "w1", competitionId: "c2", projectId: "p2" }
  ]);
  assert.equal(dupes.length, 0);
});

// ── Constants sanity checks ──

test("STATUS_WEIGHTS has expected values", () => {
  assert.equal(STATUS_WEIGHTS.pending, 0);
  assert.equal(STATUS_WEIGHTS.winner, 10);
  assert.ok(STATUS_WEIGHTS.semifinalist > STATUS_WEIGHTS.quarterfinalist);
  assert.ok(STATUS_WEIGHTS.finalist > STATUS_WEIGHTS.semifinalist);
});

test("DEFAULT_PRESTIGE_MULTIPLIERS increases monotonically", () => {
  assert.ok(DEFAULT_PRESTIGE_MULTIPLIERS.standard < DEFAULT_PRESTIGE_MULTIPLIERS.notable);
  assert.ok(DEFAULT_PRESTIGE_MULTIPLIERS.notable < DEFAULT_PRESTIGE_MULTIPLIERS.elite);
  assert.ok(DEFAULT_PRESTIGE_MULTIPLIERS.elite < DEFAULT_PRESTIGE_MULTIPLIERS.premier);
});
