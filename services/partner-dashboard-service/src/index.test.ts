import assert from "node:assert/strict";
import test from "node:test";
import type {
  PartnerAnalyticsSummary,
  PartnerCompetition,
  PartnerCompetitionCreateRequest,
  PartnerDraftSwapRequest,
  PartnerEvaluationRequest,
  PartnerFilmFreewaySyncRequest,
  PartnerJudgeAssignmentRequest,
  PartnerNormalizeRequest,
  PartnerPublishResultsRequest,
  PartnerSubmission
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type {
  PartnerDashboardRepository,
  PartnerDraftSwapResult,
  PartnerJudgeAssignmentResult,
  PartnerNormalizationResult,
  PartnerPublishResultsResult,
  PartnerSyncJobResult
} from "./repository.js";

class MemoryPartnerRepository implements PartnerDashboardRepository {
  private competitions = new Map<string, PartnerCompetition>();
  private submissions = new Map<string, PartnerSubmission>();

  async init(): Promise<void> {
    const now = new Date().toISOString();
    this.competitions.set("competition_1", {
      id: "competition_1",
      organizerAccountId: "organizer_1",
      slug: "spring-fellowship-2026",
      title: "Spring Fellowship 2026",
      description: "",
      format: "feature",
      genre: "drama",
      status: "open",
      submissionOpensAt: now,
      submissionClosesAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdByUserId: "admin_01",
      createdAt: now,
      updatedAt: now
    });
    this.submissions.set("submission_1", {
      id: "submission_1",
      competitionId: "competition_1",
      writerUserId: "writer_01",
      projectId: "project_01",
      scriptId: "script_01",
      status: "received",
      entryFeeCents: 0,
      notes: "",
      createdAt: now,
      updatedAt: now
    });
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async createCompetition(_adminUserId: string, input: PartnerCompetitionCreateRequest): Promise<PartnerCompetition | null> {
    const now = new Date().toISOString();
    const competition: PartnerCompetition = {
      id: `competition_${this.competitions.size + 1}`,
      organizerAccountId: input.organizerAccountId,
      slug: input.slug,
      title: input.title,
      description: input.description,
      format: input.format,
      genre: input.genre,
      status: input.status,
      submissionOpensAt: input.submissionOpensAt,
      submissionClosesAt: input.submissionClosesAt,
      createdByUserId: "admin_01",
      createdAt: now,
      updatedAt: now
    };
    this.competitions.set(competition.id, competition);
    return competition;
  }

  async listCompetitionSubmissions(competitionId: string): Promise<PartnerSubmission[] | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return [...this.submissions.values()].filter((submission) => submission.competitionId === competitionId);
  }

  async assignJudges(
    competitionId: string,
    _adminUserId: string,
    input: PartnerJudgeAssignmentRequest
  ): Promise<PartnerJudgeAssignmentResult | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return { assignedCount: input.submissionIds.length };
  }

  async recordEvaluation(
    competitionId: string,
    _adminUserId: string,
    input: PartnerEvaluationRequest
  ): Promise<PartnerSubmission | null> {
    const submission = this.submissions.get(input.submissionId);
    if (!submission || submission.competitionId !== competitionId) {
      return null;
    }
    const next: PartnerSubmission = {
      ...submission,
      status: "in_review",
      updatedAt: new Date().toISOString()
    };
    this.submissions.set(next.id, next);
    return next;
  }

  async runNormalization(
    competitionId: string,
    _adminUserId: string,
    _input: PartnerNormalizeRequest
  ): Promise<PartnerNormalizationResult | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return { runId: "normalization_1", evaluatedCount: 1 };
  }

  async publishResults(
    competitionId: string,
    _adminUserId: string,
    input: PartnerPublishResultsRequest
  ): Promise<PartnerPublishResultsResult | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return { publishedCount: input.results.length };
  }

  async processDraftSwap(
    competitionId: string,
    _adminUserId: string,
    input: PartnerDraftSwapRequest
  ): Promise<PartnerDraftSwapResult | null> {
    const submission = this.submissions.get(input.submissionId);
    if (!submission || submission.competitionId !== competitionId) {
      return null;
    }
    this.submissions.set(submission.id, {
      ...submission,
      scriptId: input.replacementScriptId,
      updatedAt: new Date().toISOString()
    });
    return {
      swapId: "swap_1",
      submissionId: input.submissionId,
      replacementScriptId: input.replacementScriptId,
      feeCents: input.feeCents
    };
  }

  async getCompetitionAnalytics(competitionId: string): Promise<PartnerAnalyticsSummary | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return {
      submissionsTotal: 1,
      submissionsPublished: 0,
      judgesAssigned: 1,
      evaluationsSubmitted: 1,
      normalizationRuns: 1,
      resultsPublished: 0,
      draftSwapsProcessed: 1,
      syncJobsTotal: 1,
      syncJobsFailed: 0
    };
  }

  async queueFilmFreewaySync(
    _adminUserId: string,
    input: PartnerFilmFreewaySyncRequest
  ): Promise<PartnerSyncJobResult | null> {
    if (!this.competitions.has(input.competitionId)) {
      return null;
    }
    return {
      jobId: "sync_1",
      competitionId: input.competitionId,
      direction: input.direction,
      status: "queued"
    };
  }
}

test("partner dashboard service supports organizer operations flow", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const createCompetition = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      organizerAccountId: "organizer_1",
      slug: "pilot-lab-2026",
      title: "Pilot Lab 2026",
      format: "pilot",
      genre: "drama",
      submissionOpensAt: "2026-01-01T00:00:00.000Z",
      submissionClosesAt: "2026-02-01T00:00:00.000Z"
    }
  });
  assert.equal(createCompetition.statusCode, 201);

  const submissions = await server.inject({
    method: "GET",
    url: "/internal/partners/competitions/competition_1/submissions",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(submissions.statusCode, 200);
  assert.equal(submissions.json().submissions.length, 1);

  const assign = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/judges/assign",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { judgeUserId: "judge_01", submissionIds: ["submission_1"] }
  });
  assert.equal(assign.statusCode, 200);

  const evalRes = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/evaluations",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { submissionId: "submission_1", judgeUserId: "judge_01", score: 88 }
  });
  assert.equal(evalRes.statusCode, 200);

  const normalize = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/normalize",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { round: "default" }
  });
  assert.equal(normalize.statusCode, 200);

  const publish = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/publish-results",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      results: [{ submissionId: "submission_1", placementStatus: "winner" }]
    }
  });
  assert.equal(publish.statusCode, 200);

  const swap = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/draft-swaps",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      submissionId: "submission_1",
      replacementScriptId: "script_02"
    }
  });
  assert.equal(swap.statusCode, 200);

  const analytics = await server.inject({
    method: "GET",
    url: "/internal/partners/competitions/competition_1/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(analytics.statusCode, 200);

  const sync = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      competitionId: "competition_1",
      direction: "import"
    }
  });
  assert.equal(sync.statusCode, 202);
});

test("partner dashboard service enforces auth, validation, and missing-resource guards", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const missingAdmin = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions",
    payload: {
      organizerAccountId: "organizer_1",
      slug: "bad",
      title: "Bad",
      format: "feature",
      genre: "drama",
      submissionOpensAt: "2026-01-01T00:00:00.000Z",
      submissionClosesAt: "2026-02-01T00:00:00.000Z"
    }
  });
  assert.equal(missingAdmin.statusCode, 403);

  const invalidCompetitionPayload = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { title: "Only title" }
  });
  assert.equal(invalidCompetitionPayload.statusCode, 400);

  const missingCompetitionSubmissions = await server.inject({
    method: "GET",
    url: "/internal/partners/competitions/competition_404/submissions",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(missingCompetitionSubmissions.statusCode, 404);

  const invalidAssignPayload = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/judges/assign",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { judgeUserId: "judge_01", submissionIds: [] }
  });
  assert.equal(invalidAssignPayload.statusCode, 400);

  const missingEvaluationTarget = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_404/evaluations",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { submissionId: "submission_404", judgeUserId: "judge_01", score: 88 }
  });
  assert.equal(missingEvaluationTarget.statusCode, 404);

  const invalidNormalizePayload = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/normalize",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { round: "" }
  });
  assert.equal(invalidNormalizePayload.statusCode, 400);

  const missingPublishTarget = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_404/publish-results",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { results: [{ submissionId: "submission_1", placementStatus: "winner" }] }
  });
  assert.equal(missingPublishTarget.statusCode, 404);

  const missingDraftSwapTarget = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/draft-swaps",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { submissionId: "submission_404", replacementScriptId: "script_2" }
  });
  assert.equal(missingDraftSwapTarget.statusCode, 404);

  const missingAnalyticsTarget = await server.inject({
    method: "GET",
    url: "/internal/partners/competitions/competition_404/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(missingAnalyticsTarget.statusCode, 404);

  const missingSyncTarget = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { competitionId: "competition_404", direction: "import" }
  });
  assert.equal(missingSyncTarget.statusCode, 404);
});
