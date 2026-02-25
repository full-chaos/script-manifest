import { randomUUID } from "node:crypto";
import {
  PartnerAnalyticsSummarySchema,
  type PartnerAnalyticsSummary,
  PartnerCompetitionCreateRequestSchema,
  type PartnerCompetitionCreateRequest,
  PartnerCompetitionSchema,
  type PartnerCompetition,
  PartnerDraftSwapRequestSchema,
  type PartnerDraftSwapRequest,
  PartnerEvaluationRequestSchema,
  type PartnerEvaluationRequest,
  PartnerFilmFreewaySyncRequestSchema,
  type PartnerFilmFreewaySyncRequest,
  PartnerJudgeAssignmentRequestSchema,
  type PartnerJudgeAssignmentRequest,
  PartnerNormalizeRequestSchema,
  type PartnerNormalizeRequest,
  PartnerPublishResultsRequestSchema,
  type PartnerPublishResultsRequest,
  PartnerSubmissionSchema,
  type PartnerSubmission
} from "@script-manifest/contracts";
import { ensureCoreTables, ensurePartnerTables, getPool } from "@script-manifest/db";

export type CompetitionRole = "owner" | "admin" | "editor" | "judge" | "viewer";

export type PartnerJudgeAssignmentResult = {
  assignedCount: number;
};

export type PartnerNormalizationResult = {
  runId: string;
  evaluatedCount: number;
};

export type PartnerPublishResultsResult = {
  publishedCount: number;
  writerUserIds: string[];
};

export type PartnerDraftSwapResult = {
  swapId: string;
  submissionId: string;
  replacementScriptId: string;
  feeCents: number;
};

export type PartnerSyncJobResult = {
  jobId: string;
  competitionId: string;
  direction: "import" | "export";
  status: "queued" | "running" | "succeeded" | "failed";
};

export type PartnerSyncJob = PartnerSyncJobResult & {
  externalRunId: string | null;
  detail: string;
  triggeredByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerCompetitionMembership = {
  competitionId: string;
  userId: string;
  role: CompetitionRole;
};

export type PartnerCompetitionIntakeConfig = {
  formFields: Array<Record<string, unknown>>;
  feeRules: {
    baseFeeCents: number;
    lateFeeCents: number;
  };
};

export type PartnerCompetitionIntakeConfigAudit = PartnerCompetitionIntakeConfig & {
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type PartnerSubmissionWithFormResponses = PartnerSubmission & {
  formResponses: Record<string, unknown>;
};

export type PartnerEntrantMessageKind = "direct" | "broadcast" | "reminder";

export type PartnerEntrantMessage = {
  id: string;
  competitionId: string;
  senderUserId: string;
  targetUserId: string | null;
  messageKind: PartnerEntrantMessageKind;
  templateKey: string;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PartnerEntrantMessageCreateInput = {
  targetUserId?: string | null;
  messageKind: PartnerEntrantMessageKind;
  templateKey?: string;
  subject?: string;
  body?: string;
  metadata?: Record<string, unknown>;
};

export interface PartnerDashboardRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  competitionExists(competitionId: string): Promise<boolean>;
  getCompetitionRole(competitionId: string, userId: string): Promise<CompetitionRole | null>;
  upsertCompetitionMembership(
    competitionId: string,
    userId: string,
    role: CompetitionRole
  ): Promise<PartnerCompetitionMembership | null>;
  getCompetitionIntakeConfig(competitionId: string): Promise<PartnerCompetitionIntakeConfig | null>;
  upsertCompetitionIntakeConfig(
    competitionId: string,
    actorUserId: string,
    config: PartnerCompetitionIntakeConfig
  ): Promise<PartnerCompetitionIntakeConfigAudit | null>;
  createCompetitionSubmission(
    competitionId: string,
    input: {
      writerUserId: string;
      projectId: string;
      scriptId: string;
      formResponses: Record<string, unknown>;
      entryFeeCents: number;
      notes?: string;
    }
  ): Promise<PartnerSubmissionWithFormResponses | null>;
  createEntrantMessage(
    competitionId: string,
    senderUserId: string,
    input: PartnerEntrantMessageCreateInput
  ): Promise<PartnerEntrantMessage | null>;
  listEntrantMessages(
    competitionId: string,
    input?: { targetUserId?: string; limit?: number }
  ): Promise<PartnerEntrantMessage[] | null>;
  createCompetition(adminUserId: string, input: PartnerCompetitionCreateRequest): Promise<PartnerCompetition | null>;
  listCompetitionSubmissions(competitionId: string): Promise<PartnerSubmission[] | null>;
  assignJudges(
    competitionId: string,
    adminUserId: string,
    input: PartnerJudgeAssignmentRequest
  ): Promise<PartnerJudgeAssignmentResult | null>;
  recordEvaluation(
    competitionId: string,
    adminUserId: string,
    input: PartnerEvaluationRequest
  ): Promise<PartnerSubmission | null>;
  runNormalization(
    competitionId: string,
    adminUserId: string,
    input: PartnerNormalizeRequest
  ): Promise<PartnerNormalizationResult | null>;
  publishResults(
    competitionId: string,
    adminUserId: string,
    input: PartnerPublishResultsRequest
  ): Promise<PartnerPublishResultsResult | null>;
  processDraftSwap(
    competitionId: string,
    adminUserId: string,
    input: PartnerDraftSwapRequest
  ): Promise<PartnerDraftSwapResult | null>;
  getCompetitionAnalytics(competitionId: string): Promise<PartnerAnalyticsSummary | null>;
  queueFilmFreewaySync(
    adminUserId: string,
    input: PartnerFilmFreewaySyncRequest
  ): Promise<PartnerSyncJob | null>;
  claimNextFilmFreewaySyncJob(): Promise<PartnerSyncJob | null>;
  completeFilmFreewaySyncJob(jobId: string, detail?: string): Promise<PartnerSyncJob | null>;
  failFilmFreewaySyncJob(jobId: string, detail: string): Promise<PartnerSyncJob | null>;
}

function mapCompetition(row: Record<string, unknown>): PartnerCompetition {
  return PartnerCompetitionSchema.parse({
    id: row.id,
    organizerAccountId: row.organizer_account_id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    format: row.format,
    genre: row.genre,
    status: row.status,
    submissionOpensAt: new Date(String(row.submission_opens_at)).toISOString(),
    submissionClosesAt: new Date(String(row.submission_closes_at)).toISOString(),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapSubmission(row: Record<string, unknown>): PartnerSubmission {
  return PartnerSubmissionSchema.parse({
    id: row.id,
    competitionId: row.competition_id,
    writerUserId: row.writer_user_id,
    projectId: row.project_id,
    scriptId: row.script_id,
    status: row.status,
    entryFeeCents: Number(row.entry_fee_cents ?? 0),
    notes: row.notes ?? "",
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapSubmissionWithFormResponses(row: Record<string, unknown>): PartnerSubmissionWithFormResponses {
  const submission = mapSubmission(row);
  const formResponsesRaw = row.form_responses;
  const formResponses = (
    typeof formResponsesRaw === "object" &&
    formResponsesRaw !== null &&
    !Array.isArray(formResponsesRaw)
      ? formResponsesRaw
      : {}
  ) as Record<string, unknown>;
  return {
    ...submission,
    formResponses
  };
}

function mapSyncJob(row: Record<string, unknown>): PartnerSyncJob {
  return {
    jobId: String(row.id),
    competitionId: String(row.competition_id),
    direction: row.direction === "export" ? "export" : "import",
    status: row.status as PartnerSyncJob["status"],
    externalRunId: typeof row.external_run_id === "string" ? row.external_run_id : null,
    detail: String(row.detail ?? ""),
    triggeredByUserId: String(row.triggered_by_user_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapEntrantMessage(row: Record<string, unknown>): PartnerEntrantMessage {
  const metadataRaw = row.metadata_json;
  const metadata = (
    typeof metadataRaw === "object" &&
    metadataRaw !== null &&
    !Array.isArray(metadataRaw)
      ? metadataRaw
      : {}
  ) as Record<string, unknown>;
  return {
    id: String(row.id),
    competitionId: String(row.competition_id),
    senderUserId: String(row.sender_user_id),
    targetUserId: typeof row.target_user_id === "string" ? row.target_user_id : null,
    messageKind: row.message_kind as PartnerEntrantMessageKind,
    templateKey: String(row.template_key ?? ""),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    metadata,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

async function ensureUserExists(userId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query("SELECT 1 FROM app_users WHERE id = $1 LIMIT 1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

async function ensureCompetitionExists(competitionId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query("SELECT 1 FROM partner_competitions WHERE id = $1 LIMIT 1", [competitionId]);
  return (result.rowCount ?? 0) > 0;
}

export class PgPartnerDashboardRepository implements PartnerDashboardRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
    await ensurePartnerTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    const db = getPool();
    await db.query("SELECT 1");
    return { database: true };
  }

  async competitionExists(competitionId: string): Promise<boolean> {
    return ensureCompetitionExists(competitionId);
  }

  async getCompetitionRole(competitionId: string, userId: string): Promise<CompetitionRole | null> {
    const db = getPool();
    const result = await db.query(
      `SELECT om.role
         FROM partner_competitions pc
         LEFT JOIN organizer_memberships om
           ON om.organizer_account_id = pc.organizer_account_id
          AND om.user_id = $2
        WHERE pc.id = $1
        LIMIT 1`,
      [competitionId, userId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    const row = result.rows[0] as Record<string, unknown>;
    return typeof row.role === "string" ? (row.role as CompetitionRole) : null;
  }

  async upsertCompetitionMembership(
    competitionId: string,
    userId: string,
    role: CompetitionRole
  ): Promise<PartnerCompetitionMembership | null> {
    const userExists = await ensureUserExists(userId);
    if (!userExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `WITH competition AS (
         SELECT organizer_account_id
           FROM partner_competitions
          WHERE id = $1
       )
       INSERT INTO organizer_memberships (
         organizer_account_id,
         user_id,
         role,
         created_at
       )
       SELECT competition.organizer_account_id, $2, $3, $4
         FROM competition
       ON CONFLICT (organizer_account_id, user_id)
       DO UPDATE SET role = EXCLUDED.role
       RETURNING user_id, role`,
      [competitionId, userId, role, now]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      competitionId,
      userId: String(row.user_id),
      role: row.role as CompetitionRole
    };
  }

  async getCompetitionIntakeConfig(competitionId: string): Promise<PartnerCompetitionIntakeConfig | null> {
    const db = getPool();
    const result = await db.query(
      `SELECT form_fields_json, fee_rules_json
         FROM partner_competition_intake_configs
        WHERE competition_id = $1
        LIMIT 1`,
      [competitionId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    const row = result.rows[0] as Record<string, unknown>;
    const formFieldsRaw = row.form_fields_json;
    const feeRulesRaw = row.fee_rules_json;
    const formFields = Array.isArray(formFieldsRaw) ? formFieldsRaw as Array<Record<string, unknown>> : [];
    const feeRules = (
      typeof feeRulesRaw === "object" &&
      feeRulesRaw !== null &&
      !Array.isArray(feeRulesRaw)
        ? feeRulesRaw
        : {}
    ) as Record<string, unknown>;

    return {
      formFields,
      feeRules: {
        baseFeeCents: Number(feeRules.baseFeeCents ?? 0),
        lateFeeCents: Number(feeRules.lateFeeCents ?? 0)
      }
    };
  }

  async upsertCompetitionIntakeConfig(
    competitionId: string,
    actorUserId: string,
    config: PartnerCompetitionIntakeConfig
  ): Promise<PartnerCompetitionIntakeConfigAudit | null> {
    const [actorExists, competitionExists] = await Promise.all([
      ensureUserExists(actorUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!actorExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO partner_competition_intake_configs (
         competition_id,
         form_fields_json,
         fee_rules_json,
         updated_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6)
       ON CONFLICT (competition_id)
       DO UPDATE SET
         form_fields_json = EXCLUDED.form_fields_json,
         fee_rules_json = EXCLUDED.fee_rules_json,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = EXCLUDED.updated_at
       RETURNING form_fields_json, fee_rules_json, updated_by_user_id, created_at, updated_at`,
      [
        competitionId,
        JSON.stringify(config.formFields),
        JSON.stringify(config.feeRules),
        actorUserId,
        now,
        now
      ]
    );
    const row = result.rows[0] as Record<string, unknown>;
    return {
      formFields: Array.isArray(row.form_fields_json)
        ? row.form_fields_json as Array<Record<string, unknown>>
        : [],
      feeRules: (() => {
        const raw = (
          typeof row.fee_rules_json === "object" &&
          row.fee_rules_json !== null &&
          !Array.isArray(row.fee_rules_json)
            ? row.fee_rules_json
            : {}
        ) as Record<string, unknown>;
        return {
          baseFeeCents: Number(raw.baseFeeCents ?? 0),
          lateFeeCents: Number(raw.lateFeeCents ?? 0)
        };
      })(),
      updatedByUserId: String(row.updated_by_user_id),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString()
    };
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
    const [competitionExists, writerExists] = await Promise.all([
      ensureCompetitionExists(competitionId),
      ensureUserExists(input.writerUserId)
    ]);
    if (!competitionExists || !writerExists) {
      return null;
    }

    const db = getPool();
    const project = await db.query(
      `SELECT id
         FROM projects
        WHERE id = $1
          AND owner_user_id = $2
        LIMIT 1`,
      [input.projectId, input.writerUserId]
    );
    if ((project.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO partner_submissions (
         id,
         competition_id,
         writer_user_id,
         project_id,
         script_id,
         status,
         entry_fee_cents,
         notes,
         form_responses,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,'received',$6,$7,$8::jsonb,$9,$10)
       RETURNING *`,
      [
        `partner_submission_${randomUUID()}`,
        competitionId,
        input.writerUserId,
        input.projectId,
        input.scriptId,
        input.entryFeeCents,
        input.notes ?? "",
        JSON.stringify(input.formResponses),
        now,
        now
      ]
    );
    return mapSubmissionWithFormResponses(result.rows[0] as Record<string, unknown>);
  }

  async createEntrantMessage(
    competitionId: string,
    senderUserId: string,
    input: PartnerEntrantMessageCreateInput
  ): Promise<PartnerEntrantMessage | null> {
    const [competitionExists, senderExists] = await Promise.all([
      ensureCompetitionExists(competitionId),
      ensureUserExists(senderUserId)
    ]);
    if (!competitionExists || !senderExists) {
      return null;
    }
    if (input.targetUserId) {
      const targetExists = await ensureUserExists(input.targetUserId);
      if (!targetExists) {
        return null;
      }
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO partner_entrant_messages (
         id,
         competition_id,
         sender_user_id,
         target_user_id,
         message_kind,
         template_key,
         subject,
         body,
         metadata_json,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       RETURNING *`,
      [
        `partner_message_${randomUUID()}`,
        competitionId,
        senderUserId,
        input.targetUserId ?? null,
        input.messageKind,
        input.templateKey ?? "",
        input.subject ?? "",
        input.body ?? "",
        JSON.stringify(input.metadata ?? {}),
        now
      ]
    );
    return mapEntrantMessage(result.rows[0] as Record<string, unknown>);
  }

  async listEntrantMessages(
    competitionId: string,
    input: { targetUserId?: string; limit?: number } = {}
  ): Promise<PartnerEntrantMessage[] | null> {
    const competitionExists = await ensureCompetitionExists(competitionId);
    if (!competitionExists) {
      return null;
    }
    const db = getPool();
    const limit = Math.max(1, Math.min(500, input.limit ?? 100));
    const result = await db.query(
      `SELECT *
         FROM partner_entrant_messages
        WHERE competition_id = $1
          AND ($2::text IS NULL OR target_user_id = $2 OR target_user_id IS NULL)
        ORDER BY created_at DESC
        LIMIT $3`,
      [competitionId, input.targetUserId ?? null, limit]
    );
    return result.rows.map((row) => mapEntrantMessage(row as Record<string, unknown>));
  }

  async createCompetition(
    adminUserId: string,
    input: PartnerCompetitionCreateRequest
  ): Promise<PartnerCompetition | null> {
    const parsed = PartnerCompetitionCreateRequestSchema.parse(input);
    const adminExists = await ensureUserExists(adminUserId);
    if (!adminExists) {
      return null;
    }

    const db = getPool();
    const organizer = await db.query("SELECT 1 FROM organizer_accounts WHERE id = $1 LIMIT 1", [
      parsed.organizerAccountId
    ]);
    if ((organizer.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    await db.query("BEGIN");
    try {
      const result = await db.query(
        `INSERT INTO partner_competitions (
           id,
           organizer_account_id,
           slug,
           title,
           description,
           format,
           genre,
           status,
           submission_opens_at,
           submission_closes_at,
           created_by_user_id,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          `partner_competition_${randomUUID()}`,
          parsed.organizerAccountId,
          parsed.slug,
          parsed.title,
          parsed.description,
          parsed.format,
          parsed.genre,
          parsed.status,
          parsed.submissionOpensAt,
          parsed.submissionClosesAt,
          adminUserId,
          now,
          now
        ]
      );

      const competition = mapCompetition(result.rows[0] as Record<string, unknown>);
      await db.query(
        `INSERT INTO organizer_memberships (
           organizer_account_id,
           user_id,
           role,
           created_at
         ) VALUES ($1,$2,'owner',$3)
         ON CONFLICT (organizer_account_id, user_id)
         DO UPDATE SET role = 'owner'`,
        [competition.organizerAccountId, adminUserId, now]
      );

      await db.query("COMMIT");
      return competition;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async listCompetitionSubmissions(competitionId: string): Promise<PartnerSubmission[] | null> {
    const exists = await ensureCompetitionExists(competitionId);
    if (!exists) {
      return null;
    }

    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM partner_submissions
        WHERE competition_id = $1
        ORDER BY updated_at DESC`,
      [competitionId]
    );

    return result.rows.map((row) => mapSubmission(row as Record<string, unknown>));
  }

  async assignJudges(
    competitionId: string,
    adminUserId: string,
    input: PartnerJudgeAssignmentRequest
  ): Promise<PartnerJudgeAssignmentResult | null> {
    const parsed = PartnerJudgeAssignmentRequestSchema.parse(input);
    const [adminExists, judgeExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureUserExists(parsed.judgeUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!adminExists || !judgeExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const submissions = await db.query(
      `SELECT id
         FROM partner_submissions
        WHERE competition_id = $1
          AND id = ANY($2::text[])`,
      [competitionId, parsed.submissionIds]
    );

    let assignedCount = 0;
    for (const row of submissions.rows as Array<Record<string, unknown>>) {
      const inserted = await db.query(
        `INSERT INTO partner_judge_assignments (
           competition_id,
           submission_id,
           judge_user_id,
           created_by_user_id,
           created_at
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (submission_id, judge_user_id)
         DO NOTHING`,
        [competitionId, row.id, parsed.judgeUserId, adminUserId, new Date().toISOString()]
      );
      assignedCount += inserted.rowCount ?? 0;
    }

    return { assignedCount };
  }

  async recordEvaluation(
    competitionId: string,
    adminUserId: string,
    input: PartnerEvaluationRequest
  ): Promise<PartnerSubmission | null> {
    const parsed = PartnerEvaluationRequestSchema.parse(input);
    const [adminExists, judgeExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureUserExists(parsed.judgeUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!adminExists || !judgeExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const submissionResult = await db.query(
      `SELECT *
         FROM partner_submissions
        WHERE id = $1
          AND competition_id = $2
        LIMIT 1`,
      [parsed.submissionId, competitionId]
    );
    if ((submissionResult.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO partner_evaluations (
         id,
         competition_id,
         submission_id,
         judge_user_id,
         round,
         raw_score,
         normalized_score,
         notes,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9)
       ON CONFLICT (submission_id, judge_user_id, round)
       DO UPDATE SET
         raw_score = EXCLUDED.raw_score,
         notes = EXCLUDED.notes,
         updated_at = EXCLUDED.updated_at`,
      [
        `partner_evaluation_${randomUUID()}`,
        competitionId,
        parsed.submissionId,
        parsed.judgeUserId,
        parsed.round,
        parsed.score,
        parsed.notes,
        now,
        now
      ]
    );

    await db.query(
      `UPDATE partner_submissions
          SET status = 'in_review',
              updated_at = $3
        WHERE id = $1
          AND competition_id = $2`,
      [parsed.submissionId, competitionId, now]
    );

    return mapSubmission(submissionResult.rows[0] as Record<string, unknown>);
  }

  async runNormalization(
    competitionId: string,
    adminUserId: string,
    input: PartnerNormalizeRequest
  ): Promise<PartnerNormalizationResult | null> {
    const parsed = PartnerNormalizeRequestSchema.parse(input);
    const [adminExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!adminExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const evaluations = await db.query(
      `SELECT id, judge_user_id, raw_score
         FROM partner_evaluations
        WHERE competition_id = $1
          AND round = $2`,
      [competitionId, parsed.round]
    );

    const rows = evaluations.rows as Array<Record<string, unknown>>;
    let evaluatedCount = 0;
    if (rows.length > 0) {
      const judgeTotals = new Map<string, { total: number; count: number }>();
      let globalTotal = 0;
      for (const row of rows) {
        const judgeId = String(row.judge_user_id);
        const score = Number(row.raw_score);
        globalTotal += score;
        const current = judgeTotals.get(judgeId) ?? { total: 0, count: 0 };
        current.total += score;
        current.count += 1;
        judgeTotals.set(judgeId, current);
      }
      const globalMean = globalTotal / rows.length;

      for (const row of rows) {
        const judgeId = String(row.judge_user_id);
        const rawScore = Number(row.raw_score);
        const judgeStat = judgeTotals.get(judgeId);
        const judgeMean = judgeStat ? judgeStat.total / judgeStat.count : rawScore;
        const normalized = Math.min(100, Math.max(0, rawScore + (globalMean - judgeMean)));
        await db.query("UPDATE partner_evaluations SET normalized_score = $2 WHERE id = $1", [row.id, normalized]);
        evaluatedCount += 1;
      }
    }

    const runId = `partner_normalization_${randomUUID()}`;
    await db.query(
      `INSERT INTO partner_normalization_runs (
         id,
         competition_id,
         round,
         triggered_by_user_id,
         evaluated_count,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [runId, competitionId, parsed.round, adminUserId, evaluatedCount, new Date().toISOString()]
    );

    return { runId, evaluatedCount };
  }

  async publishResults(
    competitionId: string,
    adminUserId: string,
    input: PartnerPublishResultsRequest
  ): Promise<PartnerPublishResultsResult | null> {
    const parsed = PartnerPublishResultsRequestSchema.parse(input);
    const [adminExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!adminExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();

    await db.query("BEGIN");
    try {
      let publishedCount = 0;
      const writerUserIds = new Set<string>();
      for (const item of parsed.results) {
        const submissionResult = await db.query(
          "SELECT id, writer_user_id FROM partner_submissions WHERE id = $1 AND competition_id = $2 LIMIT 1",
          [item.submissionId, competitionId]
        );
        if ((submissionResult.rowCount ?? 0) < 1) {
          continue;
        }
        const submissionRow = submissionResult.rows[0] as Record<string, unknown>;

        await db.query(
          `INSERT INTO partner_published_results (
             id,
             competition_id,
             submission_id,
             placement_status,
             published_by_user_id,
             notes,
             created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            `partner_result_${randomUUID()}`,
            competitionId,
            item.submissionId,
            item.placementStatus,
            adminUserId,
            parsed.notes,
            now
          ]
        );

        await db.query(
          "UPDATE partner_submissions SET status = 'published', updated_at = $3 WHERE id = $1 AND competition_id = $2",
          [item.submissionId, competitionId, now]
        );
        publishedCount += 1;
        writerUserIds.add(String(submissionRow.writer_user_id));
      }

      await db.query(
        "UPDATE partner_competitions SET status = 'published', updated_at = $2 WHERE id = $1",
        [competitionId, now]
      );

      await db.query("COMMIT");
      return {
        publishedCount,
        writerUserIds: [...writerUserIds]
      };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async processDraftSwap(
    competitionId: string,
    adminUserId: string,
    input: PartnerDraftSwapRequest
  ): Promise<PartnerDraftSwapResult | null> {
    const parsed = PartnerDraftSwapRequestSchema.parse(input);
    const [adminExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureCompetitionExists(competitionId)
    ]);
    if (!adminExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const submission = await db.query(
      "SELECT id FROM partner_submissions WHERE id = $1 AND competition_id = $2 LIMIT 1",
      [parsed.submissionId, competitionId]
    );
    if ((submission.rowCount ?? 0) < 1) {
      return null;
    }

    const swapId = `partner_swap_${randomUUID()}`;
    const now = new Date().toISOString();

    await db.query("BEGIN");
    try {
      await db.query(
        "UPDATE partner_submissions SET script_id = $3, updated_at = $4 WHERE id = $1 AND competition_id = $2",
        [parsed.submissionId, competitionId, parsed.replacementScriptId, now]
      );
      await db.query(
        `INSERT INTO partner_draft_swaps (
           id,
           competition_id,
           submission_id,
           replacement_script_id,
           fee_cents,
           reason,
           processed_by_user_id,
           created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          swapId,
          competitionId,
          parsed.submissionId,
          parsed.replacementScriptId,
          parsed.feeCents,
          parsed.reason,
          adminUserId,
          now
        ]
      );
      await db.query("COMMIT");
      return {
        swapId,
        submissionId: parsed.submissionId,
        replacementScriptId: parsed.replacementScriptId,
        feeCents: parsed.feeCents
      };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async getCompetitionAnalytics(competitionId: string): Promise<PartnerAnalyticsSummary | null> {
    const competitionExists = await ensureCompetitionExists(competitionId);
    if (!competitionExists) {
      return null;
    }

    const db = getPool();
    const [submissions, assignments, evaluations, normalization, results, swaps, syncJobs] = await Promise.all([
      db.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'published')::int AS published
         FROM partner_submissions
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT COUNT(DISTINCT judge_user_id)::int AS judges_assigned
         FROM partner_judge_assignments
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS evaluations_submitted
         FROM partner_evaluations
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS runs
         FROM partner_normalization_runs
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS published_results
         FROM partner_published_results
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS swaps
         FROM partner_draft_swaps
         WHERE competition_id = $1`,
        [competitionId]
      ),
      db.query(
        `SELECT
            COUNT(*)::int AS sync_total,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS sync_failed
         FROM partner_sync_jobs
         WHERE competition_id = $1`,
        [competitionId]
      )
    ]);

    const subRow = submissions.rows[0] as Record<string, unknown>;
    const assignmentRow = assignments.rows[0] as Record<string, unknown>;
    const evalRow = evaluations.rows[0] as Record<string, unknown>;
    const normRow = normalization.rows[0] as Record<string, unknown>;
    const resultRow = results.rows[0] as Record<string, unknown>;
    const swapRow = swaps.rows[0] as Record<string, unknown>;
    const syncRow = syncJobs.rows[0] as Record<string, unknown>;

    return PartnerAnalyticsSummarySchema.parse({
      submissionsTotal: Number(subRow.total ?? 0),
      submissionsPublished: Number(subRow.published ?? 0),
      judgesAssigned: Number(assignmentRow.judges_assigned ?? 0),
      evaluationsSubmitted: Number(evalRow.evaluations_submitted ?? 0),
      normalizationRuns: Number(normRow.runs ?? 0),
      resultsPublished: Number(resultRow.published_results ?? 0),
      draftSwapsProcessed: Number(swapRow.swaps ?? 0),
      syncJobsTotal: Number(syncRow.sync_total ?? 0),
      syncJobsFailed: Number(syncRow.sync_failed ?? 0)
    });
  }

  async queueFilmFreewaySync(
    adminUserId: string,
    input: PartnerFilmFreewaySyncRequest
  ): Promise<PartnerSyncJob | null> {
    const parsed = PartnerFilmFreewaySyncRequestSchema.parse(input);
    const [adminExists, competitionExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureCompetitionExists(parsed.competitionId)
    ]);
    if (!adminExists || !competitionExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const jobId = `partner_sync_${randomUUID()}`;
    const result = await db.query(
      `INSERT INTO partner_sync_jobs (
         id,
         competition_id,
         direction,
         status,
         external_run_id,
         detail,
       triggered_by_user_id,
        created_at,
        updated_at
       ) VALUES ($1,$2,$3,'queued',$4,'',$5,$6,$7)
       RETURNING *`,
      [jobId, parsed.competitionId, parsed.direction, parsed.externalRunId ?? null, adminUserId, now, now]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return mapSyncJob(row);
  }

  async claimNextFilmFreewaySyncJob(): Promise<PartnerSyncJob | null> {
    const db = getPool();
    const now = new Date().toISOString();
    await db.query("BEGIN");
    try {
      const result = await db.query(
        `WITH next_job AS (
           SELECT id
             FROM partner_sync_jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         UPDATE partner_sync_jobs job
            SET status = 'running',
                updated_at = $1
           FROM next_job
          WHERE job.id = next_job.id
        RETURNING job.*`,
        [now]
      );
      await db.query("COMMIT");
      if ((result.rowCount ?? 0) < 1) {
        return null;
      }
      return mapSyncJob(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async completeFilmFreewaySyncJob(jobId: string, detail = ""): Promise<PartnerSyncJob | null> {
    const db = getPool();
    const result = await db.query(
      `UPDATE partner_sync_jobs
          SET status = 'succeeded',
              detail = $2,
              updated_at = $3
        WHERE id = $1
          AND status = 'running'
      RETURNING *`,
      [jobId, detail, new Date().toISOString()]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapSyncJob(result.rows[0] as Record<string, unknown>);
  }

  async failFilmFreewaySyncJob(jobId: string, detail: string): Promise<PartnerSyncJob | null> {
    const db = getPool();
    const result = await db.query(
      `UPDATE partner_sync_jobs
          SET status = 'failed',
              detail = $2,
              updated_at = $3
        WHERE id = $1
          AND status = 'running'
      RETURNING *`,
      [jobId, detail, new Date().toISOString()]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapSyncJob(result.rows[0] as Record<string, unknown>);
  }
}
