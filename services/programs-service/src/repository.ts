import { randomUUID } from "node:crypto";
import {
  ProgramAnalyticsSummarySchema,
  type ProgramAnalyticsSummary,
  ProgramApplicationCreateRequestSchema,
  type ProgramApplicationCreateRequest,
  ProgramApplicationReviewRequestSchema,
  type ProgramApplicationReviewRequest,
  ProgramApplicationSchema,
  type ProgramApplication,
  ProgramCohortCreateRequestSchema,
  type ProgramCohortCreateRequest,
  ProgramCohortSchema,
  type ProgramCohort,
  ProgramMentorshipMatchCreateRequestSchema,
  type ProgramMentorshipMatchCreateRequest,
  ProgramMentorshipMatchSchema,
  type ProgramMentorshipMatch,
  ProgramSchema,
  type Program,
  ProgramSessionAttendanceSchema,
  type ProgramSessionAttendance,
  ProgramSessionAttendanceUpsertRequestSchema,
  type ProgramSessionAttendanceUpsertRequest,
  ProgramSessionCreateRequestSchema,
  type ProgramSessionCreateRequest,
  ProgramSessionSchema,
  type ProgramSession
} from "@script-manifest/contracts";
import { ensureCoreTables, ensureProgramsTables, getPool } from "@script-manifest/db";

export type ProgramApplicationForm = {
  fields: Array<Record<string, unknown>>;
  updatedByUserId: string;
  updatedAt: string;
};

export type ProgramScoringRubric = {
  criteria: Array<Record<string, unknown>>;
  updatedByUserId: string;
  updatedAt: string;
};

export type ProgramAvailabilityWindow = {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgramSessionIntegration = {
  sessionId: string;
  provider: string;
  meetingUrl: string | null;
  recordingUrl: string | null;
  reminderOffsetsMinutes: number[];
  updatedByUserId: string;
  updatedAt: string;
};

export type ProgramOutcomeRow = {
  id: string;
  programId: string;
  userId: string;
  outcomeType: string;
  notes: string;
  recordedByUserId: string;
  createdAt: string;
};

export type ProgramCrmSyncJobRow = {
  id: string;
  programId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_letter";
  reason: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string;
  triggeredByUserId: string;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgramReminderCandidate = {
  programId: string;
  applicationId: string;
  userId: string;
  status: string;
  applicationCreatedAt: string;
};

export type ProgramSessionReminderCandidate = {
  programId: string;
  sessionId: string;
  userId: string;
  startsAt: string;
  provider: string;
  meetingUrl: string | null;
  reminderOffsetMinutes: number;
};

export interface ProgramsRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  listPrograms(status?: Program["status"]): Promise<Program[]>;
  getProgramApplicationForm(programId: string): Promise<ProgramApplicationForm>;
  upsertProgramApplicationForm(
    programId: string,
    adminUserId: string,
    fields: Array<Record<string, unknown>>
  ): Promise<ProgramApplicationForm | null>;
  getProgramScoringRubric(programId: string): Promise<ProgramScoringRubric>;
  upsertProgramScoringRubric(
    programId: string,
    adminUserId: string,
    criteria: Array<Record<string, unknown>>
  ): Promise<ProgramScoringRubric | null>;
  replaceAvailabilityWindows(
    programId: string,
    windows: Array<{ userId: string; startsAt: string; endsAt: string }>
  ): Promise<ProgramAvailabilityWindow[] | null>;
  listAvailabilityWindows(programId: string): Promise<ProgramAvailabilityWindow[]>;
  listProgramApplications(programId: string): Promise<ProgramApplication[]>;
  listUserProgramApplications(programId: string, userId: string): Promise<ProgramApplication[]>;
  createProgramApplication(
    programId: string,
    userId: string,
    input: ProgramApplicationCreateRequest
  ): Promise<ProgramApplication | null>;
  reviewProgramApplication(
    programId: string,
    applicationId: string,
    reviewerUserId: string,
    input: ProgramApplicationReviewRequest
  ): Promise<ProgramApplication | null>;
  listProgramCohorts(programId: string): Promise<ProgramCohort[]>;
  createProgramCohort(
    programId: string,
    adminUserId: string,
    input: ProgramCohortCreateRequest
  ): Promise<ProgramCohort | null>;
  createProgramSession(
    programId: string,
    adminUserId: string,
    input: ProgramSessionCreateRequest
  ): Promise<ProgramSession | null>;
  updateProgramSessionIntegration(
    programId: string,
    sessionId: string,
    adminUserId: string,
    update: Partial<Pick<ProgramSessionIntegration, "provider" | "meetingUrl" | "recordingUrl" | "reminderOffsetsMinutes">>
  ): Promise<ProgramSessionIntegration | null>;
  getProgramSessionIntegration(programId: string, sessionId: string): Promise<ProgramSessionIntegration | null>;
  listSessionAttendeeUserIds(programId: string, sessionId: string): Promise<string[] | null>;
  upsertSessionAttendance(
    programId: string,
    sessionId: string,
    adminUserId: string,
    input: ProgramSessionAttendanceUpsertRequest
  ): Promise<ProgramSessionAttendance | null>;
  createMentorshipMatches(
    programId: string,
    adminUserId: string,
    input: ProgramMentorshipMatchCreateRequest
  ): Promise<ProgramMentorshipMatch[] | null>;
  createProgramOutcome(
    programId: string,
    adminUserId: string,
    input: { userId: string; outcomeType: string; notes: string }
  ): Promise<ProgramOutcomeRow | null>;
  queueProgramCrmSyncJob(
    programId: string,
    adminUserId: string,
    input: { reason: string; payload: Record<string, unknown>; maxAttempts?: number }
  ): Promise<ProgramCrmSyncJobRow | null>;
  listProgramCrmSyncJobs(
    programId: string,
    filters?: { status?: ProgramCrmSyncJobRow["status"]; limit?: number; offset?: number }
  ): Promise<ProgramCrmSyncJobRow[]>;
  claimNextProgramCrmSyncJob(): Promise<ProgramCrmSyncJobRow | null>;
  completeProgramCrmSyncJob(jobId: string): Promise<void>;
  failProgramCrmSyncJob(jobId: string, errorMessage: string): Promise<ProgramCrmSyncJobRow | null>;
  markApplicationReminderSent(programId: string, applicationId: string): Promise<void>;
  hasApplicationReminderBeenSent(programId: string, applicationId: string): Promise<boolean>;
  listApplicationReminderCandidates(ageMinutes: number, limit: number): Promise<ProgramReminderCandidate[]>;
  markSessionReminderSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<void>;
  hasSessionReminderBeenSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<boolean>;
  listSessionReminderCandidates(
    horizonMinutes: number,
    lookbackMinutes: number,
    limit: number
  ): Promise<ProgramSessionReminderCandidate[]>;
  runCohortTransitionJob(): Promise<number>;
  upsertProgramKpiSnapshot(programId: string, snapshotDate: string, metrics: Record<string, unknown>): Promise<void>;
  getProgramAnalytics(programId: string): Promise<ProgramAnalyticsSummary | null>;
}

function mapProgram(row: Record<string, unknown>): Program {
  return ProgramSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    applicationOpensAt: new Date(String(row.application_opens_at)).toISOString(),
    applicationClosesAt: new Date(String(row.application_closes_at)).toISOString(),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapApplication(row: Record<string, unknown>): ProgramApplication {
  return ProgramApplicationSchema.parse({
    id: row.id,
    programId: row.program_id,
    userId: row.user_id,
    statement: row.statement ?? "",
    sampleProjectId: typeof row.sample_project_id === "string" ? row.sample_project_id : null,
    status: row.status,
    score: typeof row.score === "number" ? row.score : null,
    decisionNotes: typeof row.decision_notes === "string" ? row.decision_notes : null,
    reviewedByUserId: typeof row.reviewed_by_user_id === "string" ? row.reviewed_by_user_id : null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapCohort(row: Record<string, unknown>): ProgramCohort {
  return ProgramCohortSchema.parse({
    id: row.id,
    programId: row.program_id,
    name: row.name,
    summary: row.summary ?? "",
    startAt: new Date(String(row.start_at)).toISOString(),
    endAt: new Date(String(row.end_at)).toISOString(),
    capacity: typeof row.capacity === "number" ? row.capacity : null,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapSession(row: Record<string, unknown>): ProgramSession {
  return ProgramSessionSchema.parse({
    id: row.id,
    programId: row.program_id,
    cohortId: typeof row.cohort_id === "string" ? row.cohort_id : null,
    title: row.title,
    description: row.description ?? "",
    sessionType: row.session_type,
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: new Date(String(row.ends_at)).toISOString(),
    provider: row.provider ?? "",
    meetingUrl: typeof row.meeting_url === "string" ? row.meeting_url : null,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapAttendance(row: Record<string, unknown>): ProgramSessionAttendance {
  return ProgramSessionAttendanceSchema.parse({
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
    notes: row.notes ?? "",
    markedByUserId: typeof row.marked_by_user_id === "string" ? row.marked_by_user_id : null,
    markedAt: row.marked_at ? new Date(String(row.marked_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapMentorshipMatch(row: Record<string, unknown>): ProgramMentorshipMatch {
  return ProgramMentorshipMatchSchema.parse({
    id: row.id,
    programId: row.program_id,
    cohortId: typeof row.cohort_id === "string" ? row.cohort_id : null,
    mentorUserId: row.mentor_user_id,
    menteeUserId: row.mentee_user_id,
    status: row.status,
    notes: row.notes ?? "",
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapProgramApplicationForm(row: Record<string, unknown>): ProgramApplicationForm {
  return {
    fields: Array.isArray(row.fields_json) ? (row.fields_json as Array<Record<string, unknown>>) : [],
    updatedByUserId: String(row.updated_by_user_id ?? ""),
    updatedAt: new Date(String(row.updated_at ?? new Date(0).toISOString())).toISOString()
  };
}

function mapProgramScoringRubric(row: Record<string, unknown>): ProgramScoringRubric {
  return {
    criteria: Array.isArray(row.criteria_json) ? (row.criteria_json as Array<Record<string, unknown>>) : [],
    updatedByUserId: String(row.updated_by_user_id ?? ""),
    updatedAt: new Date(String(row.updated_at ?? new Date(0).toISOString())).toISOString()
  };
}

function mapAvailabilityWindow(row: Record<string, unknown>): ProgramAvailabilityWindow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    startsAt: new Date(String(row.starts_at)).toISOString(),
    endsAt: new Date(String(row.ends_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapProgramSessionIntegration(row: Record<string, unknown>): ProgramSessionIntegration {
  return {
    sessionId: String(row.session_id),
    provider: String(row.provider ?? ""),
    meetingUrl: typeof row.meeting_url === "string" ? row.meeting_url : null,
    recordingUrl: typeof row.recording_url === "string" ? row.recording_url : null,
    reminderOffsetsMinutes: Array.isArray(row.reminder_offsets_minutes)
      ? (row.reminder_offsets_minutes as unknown[]).map((value) => Number(value))
      : [],
    updatedByUserId: String(row.updated_by_user_id ?? ""),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

function mapProgramOutcomeRow(row: Record<string, unknown>): ProgramOutcomeRow {
  return {
    id: String(row.id),
    programId: String(row.program_id),
    userId: String(row.user_id),
    outcomeType: String(row.outcome_type),
    notes: String(row.notes ?? ""),
    recordedByUserId: String(row.recorded_by_user_id),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapProgramCrmSyncJobRow(row: Record<string, unknown>): ProgramCrmSyncJobRow {
  return {
    id: String(row.id),
    programId: String(row.program_id),
    status: String(row.status) as ProgramCrmSyncJobRow["status"],
    reason: String(row.reason ?? ""),
    payload: (row.payload as Record<string, unknown> | null) ?? {},
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    nextAttemptAt: new Date(String(row.next_attempt_at)).toISOString(),
    lastError: String(row.last_error ?? ""),
    triggeredByUserId: String(row.triggered_by_user_id),
    processedAt: row.processed_at ? new Date(String(row.processed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

async function ensureUserExists(userId: string): Promise<boolean> {
  const db = getPool();
  const result = await db.query("SELECT 1 FROM app_users WHERE id = $1 LIMIT 1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

async function ensureProgramOpen(programId: string): Promise<boolean> {
  const db = getPool();
  const programResult = await db.query(
    `SELECT 1
       FROM programs
      WHERE id = $1
        AND status = 'open'
        AND application_opens_at <= NOW()
        AND application_closes_at >= NOW()
      LIMIT 1`,
    [programId]
  );
  return (programResult.rowCount ?? 0) > 0;
}

async function ensureProgramExists(programId: string): Promise<boolean> {
  const db = getPool();
  const programResult = await db.query("SELECT 1 FROM programs WHERE id = $1 LIMIT 1", [programId]);
  return (programResult.rowCount ?? 0) > 0;
}

export class PgProgramsRepository implements ProgramsRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
    await ensureProgramsTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    const db = getPool();
    await db.query("SELECT 1");
    return { database: true };
  }

  async listPrograms(status?: Program["status"]): Promise<Program[]> {
    const db = getPool();
    const where = status ? "WHERE status = $1" : "";
    const params = status ? [status] : [];
    const result = await db.query(
      `SELECT *
         FROM programs
         ${where}
        ORDER BY application_closes_at ASC`,
      params
    );
    return result.rows.map((row) => mapProgram(row as Record<string, unknown>));
  }

  async getProgramApplicationForm(programId: string): Promise<ProgramApplicationForm> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_application_forms
        WHERE program_id = $1
        LIMIT 1`,
      [programId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return {
        fields: [],
        updatedByUserId: "",
        updatedAt: new Date(0).toISOString()
      };
    }
    return mapProgramApplicationForm(result.rows[0] as Record<string, unknown>);
  }

  async upsertProgramApplicationForm(
    programId: string,
    adminUserId: string,
    fields: Array<Record<string, unknown>>
  ): Promise<ProgramApplicationForm | null> {
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO program_application_forms (
         program_id,
         fields_json,
         updated_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2::jsonb,$3,$4,$5)
       ON CONFLICT (program_id)
       DO UPDATE SET
         fields_json = EXCLUDED.fields_json,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [programId, JSON.stringify(fields), adminUserId, now, now]
    );
    return mapProgramApplicationForm(result.rows[0] as Record<string, unknown>);
  }

  async getProgramScoringRubric(programId: string): Promise<ProgramScoringRubric> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_scoring_rubrics
        WHERE program_id = $1
        LIMIT 1`,
      [programId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return {
        criteria: [],
        updatedByUserId: "",
        updatedAt: new Date(0).toISOString()
      };
    }
    return mapProgramScoringRubric(result.rows[0] as Record<string, unknown>);
  }

  async upsertProgramScoringRubric(
    programId: string,
    adminUserId: string,
    criteria: Array<Record<string, unknown>>
  ): Promise<ProgramScoringRubric | null> {
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO program_scoring_rubrics (
         program_id,
         criteria_json,
         updated_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2::jsonb,$3,$4,$5)
       ON CONFLICT (program_id)
       DO UPDATE SET
         criteria_json = EXCLUDED.criteria_json,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [programId, JSON.stringify(criteria), adminUserId, now, now]
    );
    return mapProgramScoringRubric(result.rows[0] as Record<string, unknown>);
  }

  async replaceAvailabilityWindows(
    programId: string,
    windows: Array<{ userId: string; startsAt: string; endsAt: string }>
  ): Promise<ProgramAvailabilityWindow[] | null> {
    const programExists = await ensureProgramExists(programId);
    if (!programExists) {
      return null;
    }

    const uniqueUserIds = [...new Set(windows.map((window) => window.userId))];
    if (uniqueUserIds.length > 0) {
      const db = getPool();
      const users = await db.query("SELECT id FROM app_users WHERE id = ANY($1::text[])", [uniqueUserIds]);
      const existingIds = new Set(users.rows.map((row) => String((row as Record<string, unknown>).id)));
      for (const userId of uniqueUserIds) {
        if (!existingIds.has(userId)) {
          return null;
        }
      }
    }

    const db = getPool();
    const now = new Date().toISOString();
    await db.query("BEGIN");
    try {
      await db.query("DELETE FROM program_availability_windows WHERE program_id = $1", [programId]);
      for (const window of windows) {
        await db.query(
          `INSERT INTO program_availability_windows (
             id,
             program_id,
             user_id,
             starts_at,
             ends_at,
             created_at,
             updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [`program_availability_${randomUUID()}`, programId, window.userId, window.startsAt, window.endsAt, now, now]
        );
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    return this.listAvailabilityWindows(programId);
  }

  async listAvailabilityWindows(programId: string): Promise<ProgramAvailabilityWindow[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_availability_windows
        WHERE program_id = $1
        ORDER BY starts_at ASC`,
      [programId]
    );
    return result.rows.map((row) => mapAvailabilityWindow(row as Record<string, unknown>));
  }

  async listProgramApplications(programId: string): Promise<ProgramApplication[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_applications
        WHERE program_id = $1
        ORDER BY updated_at DESC`,
      [programId]
    );
    return result.rows.map((row) => mapApplication(row as Record<string, unknown>));
  }

  async listUserProgramApplications(programId: string, userId: string): Promise<ProgramApplication[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_applications
        WHERE program_id = $1
          AND user_id = $2
        ORDER BY updated_at DESC`,
      [programId, userId]
    );
    return result.rows.map((row) => mapApplication(row as Record<string, unknown>));
  }

  async createProgramApplication(
    programId: string,
    userId: string,
    input: ProgramApplicationCreateRequest
  ): Promise<ProgramApplication | null> {
    const parsed = ProgramApplicationCreateRequestSchema.parse(input);
    const [userExists, programOpen] = await Promise.all([
      ensureUserExists(userId),
      ensureProgramOpen(programId)
    ]);
    if (!userExists || !programOpen) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO program_applications (
         id,
         program_id,
         user_id,
         statement,
         sample_project_id,
         status,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7)
       ON CONFLICT (program_id, user_id)
       DO UPDATE SET
         statement = EXCLUDED.statement,
         sample_project_id = EXCLUDED.sample_project_id,
         status = 'submitted',
         score = NULL,
         decision_notes = NULL,
         reviewed_by_user_id = NULL,
         reviewed_at = NULL,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        `program_application_${randomUUID()}`,
        programId,
        userId,
        parsed.statement,
        parsed.sampleProjectId ?? null,
        now,
        now
      ]
    );
    return mapApplication(result.rows[0] as Record<string, unknown>);
  }

  async reviewProgramApplication(
    programId: string,
    applicationId: string,
    reviewerUserId: string,
    input: ProgramApplicationReviewRequest
  ): Promise<ProgramApplication | null> {
    const parsed = ProgramApplicationReviewRequestSchema.parse(input);
    const reviewerExists = await ensureUserExists(reviewerUserId);
    if (!reviewerExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `UPDATE program_applications
          SET status = $3,
              score = $4,
              decision_notes = $5,
              reviewed_by_user_id = $6,
              reviewed_at = $7,
              updated_at = $7
        WHERE id = $1
          AND program_id = $2
      RETURNING *`,
      [
        applicationId,
        programId,
        parsed.status,
        parsed.score ?? null,
        parsed.decisionNotes || null,
        reviewerUserId,
        now
      ]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapApplication(result.rows[0] as Record<string, unknown>);
  }

  async listProgramCohorts(programId: string): Promise<ProgramCohort[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM program_cohorts
        WHERE program_id = $1
        ORDER BY start_at ASC`,
      [programId]
    );
    return result.rows.map((row) => mapCohort(row as Record<string, unknown>));
  }

  async createProgramCohort(
    programId: string,
    adminUserId: string,
    input: ProgramCohortCreateRequest
  ): Promise<ProgramCohort | null> {
    const parsed = ProgramCohortCreateRequestSchema.parse(input);
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const cohortId = `program_cohort_${randomUUID()}`;

    await db.query("BEGIN");
    try {
      const inserted = await db.query(
        `INSERT INTO program_cohorts (
           id,
           program_id,
           name,
           summary,
           start_at,
           end_at,
           capacity,
           created_by_user_id,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          cohortId,
          programId,
          parsed.name,
          parsed.summary,
          parsed.startAt,
          parsed.endAt,
          parsed.capacity ?? null,
          adminUserId,
          now,
          now
        ]
      );

      if (parsed.memberApplicationIds.length > 0) {
        const appRows = await db.query(
          `SELECT id, user_id
             FROM program_applications
            WHERE program_id = $1
              AND id = ANY($2::text[])`,
          [programId, parsed.memberApplicationIds]
        );

        for (const appRow of appRows.rows as Array<Record<string, unknown>>) {
          await db.query(
            `INSERT INTO program_cohort_members (
               cohort_id,
               user_id,
               source_application_id,
               status,
               created_at,
               updated_at
             ) VALUES ($1,$2,$3,'active',$4,$5)
             ON CONFLICT (cohort_id, user_id)
             DO UPDATE SET
               source_application_id = EXCLUDED.source_application_id,
               status = 'active',
               updated_at = EXCLUDED.updated_at`,
            [cohortId, appRow.user_id, appRow.id, now, now]
          );
        }
      }

      await db.query("COMMIT");
      return mapCohort(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async createProgramSession(
    programId: string,
    adminUserId: string,
    input: ProgramSessionCreateRequest
  ): Promise<ProgramSession | null> {
    const parsed = ProgramSessionCreateRequestSchema.parse(input);
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    if (parsed.cohortId) {
      const cohortResult = await db.query(
        "SELECT 1 FROM program_cohorts WHERE id = $1 AND program_id = $2 LIMIT 1",
        [parsed.cohortId, programId]
      );
      if ((cohortResult.rowCount ?? 0) < 1) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const sessionId = `program_session_${randomUUID()}`;

    await db.query("BEGIN");
    try {
      const inserted = await db.query(
        `INSERT INTO program_sessions (
           id,
           program_id,
           cohort_id,
           title,
           description,
           session_type,
           starts_at,
           ends_at,
           provider,
           meeting_url,
           created_by_user_id,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          sessionId,
          programId,
          parsed.cohortId ?? null,
          parsed.title,
          parsed.description,
          parsed.sessionType,
          parsed.startsAt,
          parsed.endsAt,
          parsed.provider,
          parsed.meetingUrl ?? null,
          adminUserId,
          now,
          now
        ]
      );

      if (parsed.attendeeUserIds.length > 0) {
        const users = await db.query(
          "SELECT id FROM app_users WHERE id = ANY($1::text[])",
          [parsed.attendeeUserIds]
        );
        for (const user of users.rows as Array<Record<string, unknown>>) {
          await db.query(
            `INSERT INTO program_session_attendance (
               session_id,
               user_id,
               status,
               notes,
               marked_by_user_id,
               marked_at,
               created_at,
               updated_at
             ) VALUES ($1,$2,'invited','',NULL,NULL,$3,$4)
             ON CONFLICT (session_id, user_id)
             DO UPDATE SET
               status = 'invited',
               updated_at = EXCLUDED.updated_at`,
            [sessionId, user.id, now, now]
          );
        }
      }

      await db.query(
        `INSERT INTO program_session_integrations (
           session_id,
           provider,
           meeting_url,
           recording_url,
           reminder_offsets_minutes,
           updated_by_user_id,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,NULL,'{}',$4,$5,$6)
         ON CONFLICT (session_id)
         DO UPDATE SET
           provider = EXCLUDED.provider,
           meeting_url = EXCLUDED.meeting_url,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = EXCLUDED.updated_at`,
        [sessionId, parsed.provider, parsed.meetingUrl ?? null, adminUserId, now, now]
      );

      await db.query("COMMIT");
      return mapSession(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async updateProgramSessionIntegration(
    programId: string,
    sessionId: string,
    adminUserId: string,
    update: Partial<Pick<ProgramSessionIntegration, "provider" | "meetingUrl" | "recordingUrl" | "reminderOffsetsMinutes">>
  ): Promise<ProgramSessionIntegration | null> {
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }
    const db = getPool();
    const sessionResult = await db.query(
      "SELECT 1 FROM program_sessions WHERE id = $1 AND program_id = $2 LIMIT 1",
      [sessionId, programId]
    );
    if ((sessionResult.rowCount ?? 0) < 1) {
      return null;
    }

    const current = await db.query(
      "SELECT * FROM program_session_integrations WHERE session_id = $1 LIMIT 1",
      [sessionId]
    );
    const currentRow = current.rows[0] as Record<string, unknown> | undefined;
    const provider = update.provider ?? String(currentRow?.provider ?? "");
    const meetingUrl = update.meetingUrl ?? (typeof currentRow?.meeting_url === "string" ? currentRow.meeting_url : null);
    const recordingUrl = update.recordingUrl ?? (typeof currentRow?.recording_url === "string" ? currentRow.recording_url : null);
    const reminderOffsets = update.reminderOffsetsMinutes ?? (
      Array.isArray(currentRow?.reminder_offsets_minutes)
        ? (currentRow?.reminder_offsets_minutes as unknown[]).map((value) => Number(value))
        : []
    );

    const now = new Date().toISOString();
    const upserted = await db.query(
      `INSERT INTO program_session_integrations (
         session_id,
         provider,
         meeting_url,
         recording_url,
         reminder_offsets_minutes,
         updated_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (session_id)
       DO UPDATE SET
         provider = EXCLUDED.provider,
         meeting_url = EXCLUDED.meeting_url,
         recording_url = EXCLUDED.recording_url,
         reminder_offsets_minutes = EXCLUDED.reminder_offsets_minutes,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [sessionId, provider, meetingUrl, recordingUrl, reminderOffsets, adminUserId, now, now]
    );
    return mapProgramSessionIntegration(upserted.rows[0] as Record<string, unknown>);
  }

  async getProgramSessionIntegration(programId: string, sessionId: string): Promise<ProgramSessionIntegration | null> {
    const db = getPool();
    const sessionResult = await db.query(
      "SELECT 1 FROM program_sessions WHERE id = $1 AND program_id = $2 LIMIT 1",
      [sessionId, programId]
    );
    if ((sessionResult.rowCount ?? 0) < 1) {
      return null;
    }
    const result = await db.query(
      "SELECT * FROM program_session_integrations WHERE session_id = $1 LIMIT 1",
      [sessionId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapProgramSessionIntegration(result.rows[0] as Record<string, unknown>);
  }

  async listSessionAttendeeUserIds(programId: string, sessionId: string): Promise<string[] | null> {
    const db = getPool();
    const sessionResult = await db.query(
      "SELECT 1 FROM program_sessions WHERE id = $1 AND program_id = $2 LIMIT 1",
      [sessionId, programId]
    );
    if ((sessionResult.rowCount ?? 0) < 1) {
      return null;
    }
    const attendees = await db.query(
      `SELECT user_id
         FROM program_session_attendance
        WHERE session_id = $1`,
      [sessionId]
    );
    return attendees.rows.map((row) => String((row as Record<string, unknown>).user_id));
  }

  async upsertSessionAttendance(
    programId: string,
    sessionId: string,
    adminUserId: string,
    input: ProgramSessionAttendanceUpsertRequest
  ): Promise<ProgramSessionAttendance | null> {
    const parsed = ProgramSessionAttendanceUpsertRequestSchema.parse(input);
    const [adminExists, userExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureUserExists(parsed.userId)
    ]);
    if (!adminExists || !userExists) {
      return null;
    }

    const db = getPool();
    const sessionResult = await db.query(
      "SELECT 1 FROM program_sessions WHERE id = $1 AND program_id = $2 LIMIT 1",
      [sessionId, programId]
    );
    if ((sessionResult.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO program_session_attendance (
         session_id,
         user_id,
         status,
         notes,
         marked_by_user_id,
         marked_at,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (session_id, user_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         marked_by_user_id = EXCLUDED.marked_by_user_id,
         marked_at = EXCLUDED.marked_at,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        sessionId,
        parsed.userId,
        parsed.status,
        parsed.notes,
        adminUserId,
        now,
        now,
        now
      ]
    );

    return mapAttendance(result.rows[0] as Record<string, unknown>);
  }

  async createMentorshipMatches(
    programId: string,
    adminUserId: string,
    input: ProgramMentorshipMatchCreateRequest
  ): Promise<ProgramMentorshipMatch[] | null> {
    const parsed = ProgramMentorshipMatchCreateRequestSchema.parse(input);
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    if (parsed.cohortId) {
      const cohortResult = await db.query(
        "SELECT 1 FROM program_cohorts WHERE id = $1 AND program_id = $2 LIMIT 1",
        [parsed.cohortId, programId]
      );
      if ((cohortResult.rowCount ?? 0) < 1) {
        return null;
      }
    }

    const userIds = [...new Set(parsed.matches.flatMap((item) => [item.mentorUserId, item.menteeUserId]))];
    const existingUsers = await db.query("SELECT id FROM app_users WHERE id = ANY($1::text[])", [userIds]);
    const existingSet = new Set(existingUsers.rows.map((row) => String((row as Record<string, unknown>).id)));
    for (const userId of userIds) {
      if (!existingSet.has(userId)) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const created: ProgramMentorshipMatch[] = [];

    for (const match of parsed.matches) {
      if (match.mentorUserId === match.menteeUserId) {
        continue;
      }

      const inserted = await db.query(
        `INSERT INTO program_mentorship_matches (
           id,
           program_id,
           cohort_id,
           mentor_user_id,
           mentee_user_id,
           status,
           notes,
           created_by_user_id,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)
         ON CONFLICT (program_id, mentor_user_id, mentee_user_id)
         DO UPDATE SET
           cohort_id = EXCLUDED.cohort_id,
           status = 'active',
           notes = EXCLUDED.notes,
           created_by_user_id = EXCLUDED.created_by_user_id,
           updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [
          `program_mentorship_${randomUUID()}`,
          programId,
          parsed.cohortId ?? null,
          match.mentorUserId,
          match.menteeUserId,
          match.notes,
          adminUserId,
          now,
          now
        ]
      );
      created.push(mapMentorshipMatch(inserted.rows[0] as Record<string, unknown>));
    }

    return created;
  }

  async createProgramOutcome(
    programId: string,
    adminUserId: string,
    input: { userId: string; outcomeType: string; notes: string }
  ): Promise<ProgramOutcomeRow | null> {
    const [adminExists, userExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureUserExists(input.userId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !userExists || !programExists) {
      return null;
    }

    const db = getPool();
    const result = await db.query(
      `INSERT INTO program_outcomes (
         id,
         program_id,
         user_id,
         outcome_type,
         notes,
         recorded_by_user_id,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        `program_outcome_${randomUUID()}`,
        programId,
        input.userId,
        input.outcomeType,
        input.notes,
        adminUserId,
        new Date().toISOString()
      ]
    );
    return mapProgramOutcomeRow(result.rows[0] as Record<string, unknown>);
  }

  async queueProgramCrmSyncJob(
    programId: string,
    adminUserId: string,
    input: { reason: string; payload: Record<string, unknown>; maxAttempts?: number }
  ): Promise<ProgramCrmSyncJobRow | null> {
    const [adminExists, programExists] = await Promise.all([
      ensureUserExists(adminUserId),
      ensureProgramExists(programId)
    ]);
    if (!adminExists || !programExists) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO program_crm_sync_jobs (
         id,
         program_id,
         status,
         reason,
         payload,
         attempts,
         max_attempts,
         next_attempt_at,
         last_error,
         triggered_by_user_id,
         processed_at,
         created_at,
         updated_at
       ) VALUES ($1,$2,'queued',$3,$4::jsonb,0,$5,$6,'',$7,NULL,$8,$9)
       RETURNING *`,
      [
        `program_crm_sync_${randomUUID()}`,
        programId,
        input.reason,
        JSON.stringify(input.payload ?? {}),
        input.maxAttempts ?? 5,
        now,
        adminUserId,
        now,
        now
      ]
    );
    return mapProgramCrmSyncJobRow(result.rows[0] as Record<string, unknown>);
  }

  async listProgramCrmSyncJobs(
    programId: string,
    filters?: { status?: ProgramCrmSyncJobRow["status"]; limit?: number; offset?: number }
  ): Promise<ProgramCrmSyncJobRow[]> {
    const db = getPool();
    const clauses: string[] = ["program_id = $1"];
    const params: unknown[] = [programId];
    if (filters?.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    params.push(filters?.limit ?? 100);
    const limitParam = `$${params.length}`;
    params.push(filters?.offset ?? 0);
    const offsetParam = `$${params.length}`;
    const result = await db.query(
      `SELECT *
         FROM program_crm_sync_jobs
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ${limitParam}
       OFFSET ${offsetParam}`,
      params
    );
    return result.rows.map((row) => mapProgramCrmSyncJobRow(row as Record<string, unknown>));
  }

  async claimNextProgramCrmSyncJob(): Promise<ProgramCrmSyncJobRow | null> {
    const db = getPool();
    await db.query("BEGIN");
    try {
      const selected = await db.query(
        `SELECT *
           FROM program_crm_sync_jobs
          WHERE status IN ('queued', 'failed')
            AND next_attempt_at <= NOW()
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1`
      );
      if ((selected.rowCount ?? 0) < 1) {
        await db.query("COMMIT");
        return null;
      }
      const row = selected.rows[0] as Record<string, unknown>;
      const updated = await db.query(
        `UPDATE program_crm_sync_jobs
            SET status = 'running',
                attempts = attempts + 1,
                updated_at = $2
          WHERE id = $1
        RETURNING *`,
        [row.id, new Date().toISOString()]
      );
      await db.query("COMMIT");
      return mapProgramCrmSyncJobRow(updated.rows[0] as Record<string, unknown>);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async completeProgramCrmSyncJob(jobId: string): Promise<void> {
    const db = getPool();
    const now = new Date().toISOString();
    await db.query(
      `UPDATE program_crm_sync_jobs
          SET status = 'succeeded',
              processed_at = $2,
              last_error = '',
              updated_at = $2
        WHERE id = $1`,
      [jobId, now]
    );
  }

  async failProgramCrmSyncJob(jobId: string, errorMessage: string): Promise<ProgramCrmSyncJobRow | null> {
    const db = getPool();
    const existing = await db.query(
      "SELECT id, attempts, max_attempts FROM program_crm_sync_jobs WHERE id = $1 LIMIT 1",
      [jobId]
    );
    if ((existing.rowCount ?? 0) < 1) {
      return null;
    }
    const row = existing.rows[0] as Record<string, unknown>;
    const attempts = Number(row.attempts ?? 0);
    const maxAttempts = Number(row.max_attempts ?? 5);
    const deadLetter = attempts >= maxAttempts;
    const delaySeconds = Math.min(3600, 30 * Math.max(1, attempts));
    const now = new Date().toISOString();
    const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const result = await db.query(
      `UPDATE program_crm_sync_jobs
          SET status = $2,
              last_error = $3,
              next_attempt_at = $4,
              processed_at = CASE WHEN $2 = 'dead_letter' THEN $5 ELSE processed_at END,
              updated_at = $5
        WHERE id = $1
      RETURNING *`,
      [jobId, deadLetter ? "dead_letter" : "failed", errorMessage, nextAttemptAt, now]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapProgramCrmSyncJobRow(result.rows[0] as Record<string, unknown>);
  }

  async markApplicationReminderSent(programId: string, applicationId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO program_notification_log (
         id,
         program_id,
         notification_type,
         dedupe_key,
         payload,
         sent_at
       ) VALUES ($1,$2,'application_sla_reminder',$3,$4::jsonb,$5)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        `program_notice_${randomUUID()}`,
        programId,
        `application_sla_reminder:${programId}:${applicationId}`,
        JSON.stringify({ applicationId }),
        new Date().toISOString()
      ]
    );
  }

  async hasApplicationReminderBeenSent(programId: string, applicationId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query(
      `SELECT 1
         FROM program_notification_log
        WHERE dedupe_key = $1
        LIMIT 1`,
      [`application_sla_reminder:${programId}:${applicationId}`]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listApplicationReminderCandidates(ageMinutes: number, limit: number): Promise<ProgramReminderCandidate[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT
          pa.program_id,
          pa.id AS application_id,
          pa.user_id,
          pa.status,
          pa.created_at AS application_created_at
       FROM program_applications pa
       WHERE pa.status IN ('submitted', 'under_review')
         AND pa.created_at <= NOW() - ($1::text || ' minutes')::interval
         AND NOT EXISTS (
           SELECT 1
             FROM program_notification_log pnl
            WHERE pnl.dedupe_key = ('application_sla_reminder:' || pa.program_id || ':' || pa.id)
         )
       ORDER BY pa.created_at ASC
       LIMIT $2`,
      [ageMinutes, limit]
    );
    return result.rows.map((row) => ({
      programId: String((row as Record<string, unknown>).program_id),
      applicationId: String((row as Record<string, unknown>).application_id),
      userId: String((row as Record<string, unknown>).user_id),
      status: String((row as Record<string, unknown>).status),
      applicationCreatedAt: new Date(String((row as Record<string, unknown>).application_created_at)).toISOString()
    }));
  }

  async markSessionReminderSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO program_notification_log (
         id,
         program_id,
         notification_type,
         dedupe_key,
         payload,
         sent_at
       ) VALUES ($1,$2,'session_reminder',$3,$4::jsonb,$5)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        `program_notice_${randomUUID()}`,
        programId,
        `session_reminder:${programId}:${sessionId}:${userId}:${reminderOffsetMinutes}`,
        JSON.stringify({ sessionId, userId, reminderOffsetMinutes }),
        new Date().toISOString()
      ]
    );
  }

  async hasSessionReminderBeenSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<boolean> {
    const db = getPool();
    const result = await db.query(
      `SELECT 1
         FROM program_notification_log
        WHERE dedupe_key = $1
        LIMIT 1`,
      [`session_reminder:${programId}:${sessionId}:${userId}:${reminderOffsetMinutes}`]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listSessionReminderCandidates(
    horizonMinutes: number,
    lookbackMinutes: number,
    limit: number
  ): Promise<ProgramSessionReminderCandidate[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT
          ps.program_id,
          ps.id AS session_id,
          psa.user_id,
          ps.starts_at,
          psi.provider,
          psi.meeting_url,
          offsets.offset_minute
       FROM program_sessions ps
       JOIN program_session_attendance psa ON psa.session_id = ps.id
       JOIN program_session_integrations psi ON psi.session_id = ps.id
       JOIN LATERAL unnest(
         CASE
           WHEN cardinality(psi.reminder_offsets_minutes) > 0
           THEN psi.reminder_offsets_minutes
           ELSE ARRAY[60]::INTEGER[]
         END
       ) AS offsets(offset_minute) ON TRUE
       WHERE ps.starts_at BETWEEN NOW() - ($1::text || ' minutes')::interval
                             AND NOW() + ($2::text || ' minutes')::interval
       ORDER BY ps.starts_at ASC
       LIMIT $3`,
      [lookbackMinutes, horizonMinutes, limit]
    );
    return result.rows.map((row) => ({
      programId: String((row as Record<string, unknown>).program_id),
      sessionId: String((row as Record<string, unknown>).session_id),
      userId: String((row as Record<string, unknown>).user_id),
      startsAt: new Date(String((row as Record<string, unknown>).starts_at)).toISOString(),
      provider: String((row as Record<string, unknown>).provider ?? ""),
      meetingUrl: typeof (row as Record<string, unknown>).meeting_url === "string"
        ? String((row as Record<string, unknown>).meeting_url)
        : null,
      reminderOffsetMinutes: Number((row as Record<string, unknown>).offset_minute ?? 60)
    }));
  }

  async runCohortTransitionJob(): Promise<number> {
    const db = getPool();
    const result = await db.query(
      `UPDATE program_cohort_members pcm
          SET status = 'completed',
              updated_at = $1
        WHERE status = 'active'
          AND EXISTS (
            SELECT 1
              FROM program_cohorts pc
             WHERE pc.id = pcm.cohort_id
               AND pc.end_at < NOW()
          )`,
      [new Date().toISOString()]
    );
    return result.rowCount ?? 0;
  }

  async upsertProgramKpiSnapshot(
    programId: string,
    snapshotDate: string,
    metrics: Record<string, unknown>
  ): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO program_kpi_snapshots (
         program_id,
         snapshot_date,
         metrics_json,
         created_at
       ) VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT (program_id, snapshot_date)
       DO UPDATE SET metrics_json = EXCLUDED.metrics_json`,
      [programId, snapshotDate, JSON.stringify(metrics), new Date().toISOString()]
    );
  }

  async getProgramAnalytics(programId: string): Promise<ProgramAnalyticsSummary | null> {
    const programExists = await ensureProgramExists(programId);
    if (!programExists) {
      return null;
    }

    const db = getPool();
    const [applications, cohorts, members, sessions, attendance, mentorship] = await Promise.all([
      db.query(
        `SELECT
            COUNT(*)::int AS submitted,
            COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review,
            COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
            COUNT(*) FILTER (WHERE status = 'waitlisted')::int AS waitlisted,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
         FROM program_applications
         WHERE program_id = $1`,
        [programId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS total
         FROM program_cohorts
         WHERE program_id = $1`,
        [programId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS active_members
         FROM program_cohort_members pcm
         JOIN program_cohorts pc ON pc.id = pcm.cohort_id
         WHERE pc.program_id = $1
           AND pcm.status = 'active'`,
        [programId]
      ),
      db.query(
        `SELECT
            COUNT(*)::int AS scheduled,
            COUNT(*) FILTER (WHERE ends_at < NOW())::int AS completed
         FROM program_sessions
         WHERE program_id = $1`,
        [programId]
      ),
      db.query(
        `SELECT
            COUNT(*)::int AS invited,
            COUNT(*) FILTER (WHERE status <> 'invited')::int AS marked,
            COUNT(*) FILTER (WHERE status = 'attended')::int AS attended
         FROM program_session_attendance psa
         JOIN program_sessions ps ON ps.id = psa.session_id
         WHERE ps.program_id = $1`,
        [programId]
      ),
      db.query(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM program_mentorship_matches
         WHERE program_id = $1`,
        [programId]
      )
    ]);

    const appRow = applications.rows[0] as Record<string, unknown>;
    const cohortRow = cohorts.rows[0] as Record<string, unknown>;
    const memberRow = members.rows[0] as Record<string, unknown>;
    const sessionRow = sessions.rows[0] as Record<string, unknown>;
    const attendanceRow = attendance.rows[0] as Record<string, unknown>;
    const mentorshipRow = mentorship.rows[0] as Record<string, unknown>;

    const invited = Number(attendanceRow.invited ?? 0);
    const attended = Number(attendanceRow.attended ?? 0);

    return ProgramAnalyticsSummarySchema.parse({
      applicationsSubmitted: Number(appRow.submitted ?? 0),
      applicationsUnderReview: Number(appRow.under_review ?? 0),
      applicationsAccepted: Number(appRow.accepted ?? 0),
      applicationsWaitlisted: Number(appRow.waitlisted ?? 0),
      applicationsRejected: Number(appRow.rejected ?? 0),
      cohortsTotal: Number(cohortRow.total ?? 0),
      cohortMembersActive: Number(memberRow.active_members ?? 0),
      sessionsScheduled: Number(sessionRow.scheduled ?? 0),
      sessionsCompleted: Number(sessionRow.completed ?? 0),
      attendanceInvited: invited,
      attendanceMarked: Number(attendanceRow.marked ?? 0),
      attendanceAttended: attended,
      attendanceRate: invited > 0 ? attended / invited : 0,
      mentorshipMatchesActive: Number(mentorshipRow.active ?? 0),
      mentorshipMatchesCompleted: Number(mentorshipRow.completed ?? 0)
    });
  }
}
