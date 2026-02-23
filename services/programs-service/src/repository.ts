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

export interface ProgramsRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  listPrograms(status?: Program["status"]): Promise<Program[]>;
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
          SET status = $4,
              score = $5,
              decision_notes = $6,
              reviewed_by_user_id = $7,
              reviewed_at = $8,
              updated_at = $8
        WHERE id = $1
          AND program_id = $2
      RETURNING *`,
      [
        applicationId,
        programId,
        reviewerUserId,
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

      await db.query("COMMIT");
      return mapSession(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
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
