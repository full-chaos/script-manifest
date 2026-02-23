import { randomUUID } from "node:crypto";
import {
  ProgramApplicationCreateRequestSchema,
  type ProgramApplicationCreateRequest,
  ProgramApplicationReviewRequestSchema,
  type ProgramApplicationReviewRequest,
  ProgramApplicationSchema,
  type ProgramApplication,
  ProgramSchema,
  type Program
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
    const db = getPool();
    const [userResult, programResult] = await Promise.all([
      db.query("SELECT 1 FROM app_users WHERE id = $1 LIMIT 1", [userId]),
      db.query(
        `SELECT 1
           FROM programs
          WHERE id = $1
            AND status = 'open'
            AND application_opens_at <= NOW()
            AND application_closes_at >= NOW()
          LIMIT 1`,
        [programId]
      )
    ]);
    if ((userResult.rowCount ?? 0) < 1 || (programResult.rowCount ?? 0) < 1) {
      return null;
    }

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
    const db = getPool();
    const reviewerResult = await db.query("SELECT 1 FROM app_users WHERE id = $1 LIMIT 1", [reviewerUserId]);
    if ((reviewerResult.rowCount ?? 0) < 1) {
      return null;
    }

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
}
