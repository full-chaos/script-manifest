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
  CompetitionRole,
  PartnerCompetitionIntakeConfig,
  PartnerCompetitionIntakeConfigAudit,
  PartnerCompetitionMembership,
  PartnerDashboardRepository,
  PartnerDraftSwapResult,
  PartnerEntrantMessage,
  PartnerEntrantMessageCreateInput,
  PartnerJudgeAssignmentResult,
  PartnerNormalizationResult,
  PartnerPublishResultsResult,
  PartnerSubmissionWithFormResponses,
  PartnerSyncJob
} from "./repository.js";

class MemoryPartnerRepository implements PartnerDashboardRepository {
  private competitions = new Map<string, PartnerCompetition>();
  private submissions = new Map<string, PartnerSubmissionWithFormResponses>();
  private users = new Set<string>(["admin_01", "judge_01", "judge_02", "writer_01", "writer_02"]);
  private projects = new Map<string, string>([
    ["project_01", "writer_01"],
    ["project_02", "writer_02"]
  ]);
  private memberships = new Map<string, Map<string, CompetitionRole>>();
  private intakeConfigs = new Map<string, PartnerCompetitionIntakeConfigAudit>();
  private entrantMessages: PartnerEntrantMessage[] = [];
  private syncJobs = new Map<string, PartnerSyncJob>();
  private assignmentPairs = new Set<string>();

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

    this.memberships.set("competition_1", new Map<string, CompetitionRole>([["admin_01", "owner"]]));

    this.submissions.set("submission_1", {
      id: "submission_1",
      competitionId: "competition_1",
      writerUserId: "writer_01",
      projectId: "project_01",
      scriptId: "script_01",
      status: "received",
      entryFeeCents: 0,
      notes: "",
      formResponses: {},
      createdAt: now,
      updatedAt: now
    });
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async competitionExists(competitionId: string): Promise<boolean> {
    return this.competitions.has(competitionId);
  }

  async getCompetitionRole(competitionId: string, userId: string): Promise<CompetitionRole | null> {
    return this.memberships.get(competitionId)?.get(userId) ?? null;
  }

  async upsertCompetitionMembership(
    competitionId: string,
    userId: string,
    role: CompetitionRole
  ): Promise<PartnerCompetitionMembership | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(userId)) {
      return null;
    }
    const roles = this.memberships.get(competitionId) ?? new Map<string, CompetitionRole>();
    roles.set(userId, role);
    this.memberships.set(competitionId, roles);
    return { competitionId, userId, role };
  }

  async getCompetitionIntakeConfig(competitionId: string): Promise<PartnerCompetitionIntakeConfig | null> {
    return this.intakeConfigs.get(competitionId) ?? null;
  }

  async upsertCompetitionIntakeConfig(
    competitionId: string,
    actorUserId: string,
    config: PartnerCompetitionIntakeConfig
  ): Promise<PartnerCompetitionIntakeConfigAudit | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(actorUserId)) {
      return null;
    }
    const now = new Date().toISOString();
    const existing = this.intakeConfigs.get(competitionId);
    const next: PartnerCompetitionIntakeConfigAudit = {
      formFields: config.formFields,
      feeRules: config.feeRules,
      updatedByUserId: actorUserId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.intakeConfigs.set(competitionId, next);
    return next;
  }

  async createCompetitionSubmission(
    competitionId: string,
    input: {
      writerUserId: string;
      projectId: string;
      scriptId: string;
      formResponses: Record<string, unknown>;
      entryFeeCents: number;
      notes?: string;
    }
  ): Promise<PartnerSubmissionWithFormResponses | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    if (!this.users.has(input.writerUserId)) {
      return null;
    }
    if (this.projects.get(input.projectId) !== input.writerUserId) {
      return null;
    }

    const now = new Date().toISOString();
    const submission: PartnerSubmissionWithFormResponses = {
      id: `submission_${this.submissions.size + 1}`,
      competitionId,
      writerUserId: input.writerUserId,
      projectId: input.projectId,
      scriptId: input.scriptId,
      status: "received",
      entryFeeCents: input.entryFeeCents,
      notes: input.notes ?? "",
      formResponses: input.formResponses,
      createdAt: now,
      updatedAt: now
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async createEntrantMessage(
    competitionId: string,
    senderUserId: string,
    input: PartnerEntrantMessageCreateInput
  ): Promise<PartnerEntrantMessage | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(senderUserId)) {
      return null;
    }
    if (input.targetUserId && !this.users.has(input.targetUserId)) {
      return null;
    }

    const message: PartnerEntrantMessage = {
      id: `message_${this.entrantMessages.length + 1}`,
      competitionId,
      senderUserId,
      targetUserId: input.targetUserId ?? null,
      messageKind: input.messageKind,
      templateKey: input.templateKey ?? "",
      subject: input.subject ?? "",
      body: input.body ?? "",
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString()
    };
    this.entrantMessages.unshift(message);
    return message;
  }

  async listEntrantMessages(
    competitionId: string,
    input: { targetUserId?: string; limit?: number } = {}
  ): Promise<PartnerEntrantMessage[] | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    const limit = Math.max(1, Math.min(500, input.limit ?? 100));
    return this.entrantMessages
      .filter((message) => {
        if (message.competitionId !== competitionId) {
          return false;
        }
        if (!input.targetUserId) {
          return true;
        }
        return message.targetUserId === null || message.targetUserId === input.targetUserId;
      })
      .slice(0, limit);
  }

  async createCompetition(adminUserId: string, input: PartnerCompetitionCreateRequest): Promise<PartnerCompetition | null> {
    if (!this.users.has(adminUserId)) {
      return null;
    }
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
      createdByUserId: adminUserId,
      createdAt: now,
      updatedAt: now
    };
    this.competitions.set(competition.id, competition);
    this.memberships.set(competition.id, new Map<string, CompetitionRole>([[adminUserId, "owner"]]));
    return competition;
  }

  async listCompetitionSubmissions(competitionId: string): Promise<PartnerSubmission[] | null> {
    if (!this.competitions.has(competitionId)) {
      return null;
    }
    return [...this.submissions.values()]
      .filter((submission) => submission.competitionId === competitionId)
      .map(({ formResponses: _formResponses, ...submission }) => submission);
  }

  async assignJudges(
    competitionId: string,
    adminUserId: string,
    input: PartnerJudgeAssignmentRequest
  ): Promise<PartnerJudgeAssignmentResult | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(adminUserId) || !this.users.has(input.judgeUserId)) {
      return null;
    }
    let assignedCount = 0;
    for (const submissionId of input.submissionIds) {
      const submission = this.submissions.get(submissionId);
      if (!submission || submission.competitionId !== competitionId) {
        continue;
      }
      const key = `${submissionId}:${input.judgeUserId}`;
      if (!this.assignmentPairs.has(key)) {
        this.assignmentPairs.add(key);
        assignedCount += 1;
      }
    }
    return { assignedCount };
  }

  async recordEvaluation(
    competitionId: string,
    adminUserId: string,
    input: PartnerEvaluationRequest
  ): Promise<PartnerSubmission | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(adminUserId) || !this.users.has(input.judgeUserId)) {
      return null;
    }
    const submission = this.submissions.get(input.submissionId);
    if (!submission || submission.competitionId !== competitionId) {
      return null;
    }
    const next: PartnerSubmissionWithFormResponses = {
      ...submission,
      status: "in_review",
      updatedAt: new Date().toISOString()
    };
    this.submissions.set(next.id, next);
    const { formResponses: _formResponses, ...base } = next;
    return base;
  }

  async runNormalization(
    competitionId: string,
    adminUserId: string,
    _input: PartnerNormalizeRequest
  ): Promise<PartnerNormalizationResult | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(adminUserId)) {
      return null;
    }
    return { runId: "normalization_1", evaluatedCount: 1 };
  }

  async publishResults(
    competitionId: string,
    adminUserId: string,
    input: PartnerPublishResultsRequest
  ): Promise<PartnerPublishResultsResult | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(adminUserId)) {
      return null;
    }

    let publishedCount = 0;
    const writerUserIds = new Set<string>();
    for (const result of input.results) {
      const submission = this.submissions.get(result.submissionId);
      if (!submission || submission.competitionId !== competitionId) {
        continue;
      }
      this.submissions.set(submission.id, {
        ...submission,
        status: "published",
        updatedAt: new Date().toISOString()
      });
      publishedCount += 1;
      writerUserIds.add(submission.writerUserId);
    }

    return { publishedCount, writerUserIds: [...writerUserIds] };
  }

  async processDraftSwap(
    competitionId: string,
    adminUserId: string,
    input: PartnerDraftSwapRequest
  ): Promise<PartnerDraftSwapResult | null> {
    if (!this.competitions.has(competitionId) || !this.users.has(adminUserId)) {
      return null;
    }
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
    const competitionSubmissions = [...this.submissions.values()].filter((entry) => entry.competitionId === competitionId);
    return {
      submissionsTotal: competitionSubmissions.length,
      submissionsPublished: competitionSubmissions.filter((entry) => entry.status === "published").length,
      judgesAssigned: new Set([...this.assignmentPairs.values()].map((key) => key.split(":")[1])).size,
      evaluationsSubmitted: 1,
      normalizationRuns: 1,
      resultsPublished: competitionSubmissions.filter((entry) => entry.status === "published").length,
      draftSwapsProcessed: 1,
      syncJobsTotal: [...this.syncJobs.values()].filter((entry) => entry.competitionId === competitionId).length,
      syncJobsFailed: [...this.syncJobs.values()].filter(
        (entry) => entry.competitionId === competitionId && entry.status === "failed"
      ).length
    };
  }

  async queueFilmFreewaySync(
    adminUserId: string,
    input: PartnerFilmFreewaySyncRequest
  ): Promise<PartnerSyncJob | null> {
    if (!this.competitions.has(input.competitionId) || !this.users.has(adminUserId)) {
      return null;
    }
    const now = new Date().toISOString();
    const job: PartnerSyncJob = {
      jobId: `sync_${this.syncJobs.size + 1}`,
      competitionId: input.competitionId,
      direction: input.direction,
      status: "queued",
      externalRunId: input.externalRunId ?? null,
      detail: "",
      triggeredByUserId: adminUserId,
      createdAt: now,
      updatedAt: now
    };
    this.syncJobs.set(job.jobId, job);
    return job;
  }

  async claimNextFilmFreewaySyncJob(): Promise<PartnerSyncJob | null> {
    const queued = [...this.syncJobs.values()]
      .filter((entry) => entry.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!queued) {
      return null;
    }

    const claimed: PartnerSyncJob = {
      ...queued,
      status: "running",
      updatedAt: new Date().toISOString()
    };
    this.syncJobs.set(claimed.jobId, claimed);
    return claimed;
  }

  async completeFilmFreewaySyncJob(jobId: string, detail = ""): Promise<PartnerSyncJob | null> {
    const current = this.syncJobs.get(jobId);
    if (!current || current.status !== "running") {
      return null;
    }
    const completed: PartnerSyncJob = {
      ...current,
      status: "succeeded",
      detail,
      updatedAt: new Date().toISOString()
    };
    this.syncJobs.set(jobId, completed);
    return completed;
  }

  async failFilmFreewaySyncJob(jobId: string, detail: string): Promise<PartnerSyncJob | null> {
    const current = this.syncJobs.get(jobId);
    if (!current || current.status !== "running") {
      return null;
    }
    const failed: PartnerSyncJob = {
      ...current,
      status: "failed",
      detail,
      updatedAt: new Date().toISOString()
    };
    this.syncJobs.set(jobId, failed);
    return failed;
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

test("partner dashboard service supports rbac, intake rules, and balanced assignment", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const membership = await server.inject({
    method: "PUT",
    url: "/internal/partners/competitions/competition_1/memberships/judge_01",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { role: "judge" }
  });
  assert.equal(membership.statusCode, 200);

  const intake = await server.inject({
    method: "PUT",
    url: "/internal/partners/competitions/competition_1/intake",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      formFields: [{ key: "bio", label: "Bio", type: "textarea", required: true }],
      feeRules: { baseFeeCents: 5500, lateFeeCents: 1500 }
    }
  });
  assert.equal(intake.statusCode, 200);

  const submission = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/submissions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      writerUserId: "writer_01",
      projectId: "project_01",
      scriptId: "script_01",
      formResponses: { bio: "Writer bio" }
    }
  });
  assert.equal(submission.statusCode, 201);
  assert.equal(submission.json().submission.entryFeeCents, 5500);

  const autoAssign = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/judges/auto-assign",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      judgeUserIds: ["judge_01", "judge_02"],
      maxAssignmentsPerJudge: 2
    }
  });
  assert.equal(autoAssign.statusCode, 200);
  assert.equal(autoAssign.json().assignedCount >= 1, true);
});

test("partner dashboard entrant messaging routes persist and return audit fields", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const sent = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/messages",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      targetUserId: "writer_01",
      messageKind: "direct",
      subject: "Reminder",
      body: "Please review your submission status",
      metadata: { source: "ops" }
    }
  });
  assert.equal(sent.statusCode, 201);
  assert.equal(sent.json().message.senderUserId, "admin_01");
  assert.equal(typeof sent.json().message.createdAt, "string");

  const listed = await server.inject({
    method: "GET",
    url: "/internal/partners/competitions/competition_1/messages?targetUserId=writer_01",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().messages.length, 1);
});

test("partner dashboard entrant messaging validates direct target", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const sent = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/messages",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      messageKind: "direct",
      subject: "Missing target",
      body: "Body"
    }
  });
  assert.equal(sent.statusCode, 400);
});

test("partner dashboard filmfreeway sync supports claim, complete, and fail transitions", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryPartnerRepository() });
  t.after(async () => {
    await server.close();
  });

  const queueOne = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { competitionId: "competition_1", direction: "import" }
  });
  assert.equal(queueOne.statusCode, 202);

  const claimOne = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync/jobs/claim",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(claimOne.statusCode, 200);
  assert.equal(claimOne.json().job.status, "running");

  const completeOne = await server.inject({
    method: "POST",
    url: `/internal/partners/integrations/filmfreeway/sync/jobs/${claimOne.json().job.jobId}/complete`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { detail: "imported 12 submissions" }
  });
  assert.equal(completeOne.statusCode, 200);
  assert.equal(completeOne.json().job.status, "succeeded");

  const queueTwo = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { competitionId: "competition_1", direction: "export" }
  });
  assert.equal(queueTwo.statusCode, 202);

  const claimTwo = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync/jobs/claim",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(claimTwo.statusCode, 200);

  const failTwo = await server.inject({
    method: "POST",
    url: `/internal/partners/integrations/filmfreeway/sync/jobs/${claimTwo.json().job.jobId}/fail`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { detail: "upstream timeout" }
  });
  assert.equal(failTwo.statusCode, 200);
  assert.equal(failTwo.json().job.status, "failed");
});

test("partner dashboard manual sync run endpoint uses configured runner", async (t) => {
  const seenJobs: string[] = [];
  const server = buildServer({
    logger: false,
    repository: new MemoryPartnerRepository(),
    filmFreewaySyncRunner: async (job) => {
      seenJobs.push(job.jobId);
      return { status: "succeeded", detail: "runner_complete" };
    }
  });
  t.after(async () => {
    await server.close();
  });

  const queued = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { competitionId: "competition_1", direction: "import" }
  });
  assert.equal(queued.statusCode, 202);

  const runNext = await server.inject({
    method: "POST",
    url: "/internal/partners/integrations/filmfreeway/sync/run-next",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(runNext.statusCode, 200);
  assert.equal(runNext.json().job.status, "succeeded");
  assert.equal(runNext.json().job.detail, "runner_complete");
  assert.equal(seenJobs.length, 1);
});

test("partner dashboard publish-results triggers ranking incremental recompute per writer", async (t) => {
  const observed: Array<{ url: string; body: string }> = [];
  const requestFn = (async (url: string | URL, options?: { body?: unknown }) => {
    observed.push({ url: String(url), body: String(options?.body ?? "") });
    return {
      statusCode: 202,
      body: {
        json: async () => ({ accepted: true }),
        text: async () => JSON.stringify({ accepted: true })
      }
    };
  }) as any;

  const server = buildServer({
    logger: false,
    repository: new MemoryPartnerRepository(),
    requestFn,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const created = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/submissions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      writerUserId: "writer_02",
      projectId: "project_02",
      scriptId: "script_02",
      formResponses: {}
    }
  });
  assert.equal(created.statusCode, 201);

  const publish = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/publish-results",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      results: [
        { submissionId: "submission_1", placementStatus: "winner" },
        { submissionId: created.json().submission.id, placementStatus: "finalist" }
      ]
    }
  });
  assert.equal(publish.statusCode, 200);

  assert.equal(observed.length, 2);
  assert.equal(observed[0]?.url, "http://ranking-svc/internal/recompute/incremental");
  assert.match(observed[0]?.body ?? "", /"writerId":"writer_01"/);
  assert.match(observed[1]?.body ?? "", /"writerId":"writer_02"/);
});

test("partner dashboard publish-results tolerates ranking hook failure", async (t) => {
  const requestFn = (async () => {
    return {
      statusCode: 500,
      body: {
        json: async () => ({ error: "boom" }),
        text: async () => JSON.stringify({ error: "boom" })
      }
    };
  }) as any;

  const server = buildServer({
    logger: false,
    repository: new MemoryPartnerRepository(),
    requestFn,
    rankingServiceBase: "http://ranking-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const publish = await server.inject({
    method: "POST",
    url: "/internal/partners/competitions/competition_1/publish-results",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      results: [{ submissionId: "submission_1", placementStatus: "winner" }]
    }
  });
  assert.equal(publish.statusCode, 200);
});
