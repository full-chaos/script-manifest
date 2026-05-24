import assert from "node:assert/strict";
import test from "node:test";
import type { Competition, Project } from "@script-manifest/contracts";
import { recommendForProject } from "./recommendationEngine.js";

const baseProject: Project = {
  id: "project_1",
  ownerUserId: "writer_1",
  title: "Moon Harbor",
  logline: "A coastal family drama.",
  synopsis: "",
  format: "feature",
  genre: "drama",
  language: "en",
  country: "US",
  pageCount: 102,
  isDiscoverable: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function competition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: "comp_1",
    title: "Feature Lab",
    description: "A feature screenplay lab.",
    format: "feature",
    genre: "drama",
    feeUsd: 25,
    location: "Worldwide",
    language: "en",
    feeTier: "low",
    deadline: "2026-06-15T00:00:00.000Z",
    status: "active",
    visibility: "listed",
    accessType: "open",
    ...overrides
  };
}

test("recommendForProject scores format, genre, language, location, fee, deadline, and prestige independently", () => {
  const result = recommendForProject("project_1", {
    project: baseProject,
    competitions: [competition()],
    preferredFeeTier: "low",
    prestigeByCompetitionId: new Map([["comp_1", "elite"]]),
    now: new Date("2026-06-01T00:00:00.000Z")
  });

  const [recommendation] = result.recommendations;
  assert.equal(result.projectId, "project_1");
  assert.equal(recommendation?.score, 100);
  assert.deepEqual(
    recommendation?.reasons.map((reason) => [reason.factor, reason.contribution]),
    [
      ["format", 40],
      ["genre", 30],
      ["language", 10],
      ["location", 5],
      ["fee_tier", 10],
      ["deadline", 15],
      ["prestige", 10]
    ]
  );
});

test("recommendForProject applies mismatch penalties and deadline buckets", () => {
  const result = recommendForProject("project_1", {
    project: baseProject,
    competitions: [
      competition({
        id: "comp_mismatch",
        format: "short",
        genre: "horror",
        language: "es",
        location: "GB",
        feeTier: "high",
        deadline: "2026-07-10T00:00:00.000Z"
      })
    ],
    preferredFeeTier: "low",
    now: new Date("2026-06-01T00:00:00.000Z")
  });

  const recommendation = result.recommendations[0];
  assert.equal(recommendation?.score, 0);
  assert.deepEqual(
    recommendation?.reasons.map((reason) => [reason.factor, reason.contribution]),
    [
      ["format", -20],
      ["genre", -10],
      ["language", -10],
      ["location", -5],
      ["fee_tier", 0],
      ["deadline", 5],
      ["prestige", 0]
    ]
  );
});

test("recommendForProject filters dismissed and already submitted competitions while pinned entries override score", () => {
  const result = recommendForProject("project_1", {
    project: baseProject,
    competitions: [
      competition({ id: "comp_dismissed" }),
      competition({ id: "comp_submitted" }),
      competition({ id: "comp_pinned", format: "short", genre: "horror" })
    ],
    dismissedCompetitionIds: new Set(["comp_dismissed"]),
    submittedCompetitionIds: new Set(["comp_submitted"]),
    pinnedCompetitionIds: new Set(["comp_pinned"]),
    now: new Date("2026-06-01T00:00:00.000Z")
  });

  assert.deepEqual(result.recommendations.map((item) => item.competition.id), ["comp_pinned"]);
  assert.equal(result.recommendations[0]?.score, 100);
  assert.equal(result.recommendations[0]?.isPinned, true);
  assert.equal(result.recommendations[0]?.reasons[0]?.factor, "pinned");
});

test("recommendForProject can explicitly include dismissed competitions", () => {
  const result = recommendForProject("project_1", {
    project: baseProject,
    competitions: [competition({ id: "comp_dismissed" })],
    dismissedCompetitionIds: new Set(["comp_dismissed"]),
    includeDismissed: true,
    now: new Date("2026-06-01T00:00:00.000Z")
  });

  assert.equal(result.recommendations[0]?.competition.id, "comp_dismissed");
  assert.equal(result.recommendations[0]?.isDismissed, true);
});
