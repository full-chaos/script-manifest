import { randomUUID } from "node:crypto";
import { getPool, runMigrations } from "@script-manifest/db";
import type {
  Placement,
  PlacementFilters,
  Submission,
  SubmissionFilters,
} from "@script-manifest/contracts";
import type { SubmissionTrackingRepository } from "./repository.js";

export class PgSubmissionTrackingRepository implements SubmissionTrackingRepository {
  async init(): Promise<void> {
    await runMigrations(getPool());
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  async createSubmission(data: {
    writerId: string;
    projectId: string;
    competitionId: string;
    status: string;
  }): Promise<Submission> {
    const db = getPool();
    const id = `submission_${randomUUID()}`;
    const result = await db.query<SubmissionRow>(
      `INSERT INTO submissions (id, writer_id, project_id, competition_id, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.writerId, data.projectId, data.competitionId, data.status],
    );
    return mapSubmission(result.rows[0]!);
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const db = getPool();
    const result = await db.query<SubmissionRow>(
      `SELECT * FROM submissions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async updateSubmissionProject(id: string, projectId: string): Promise<Submission | null> {
    const db = getPool();
    const result = await db.query<SubmissionRow>(
      `UPDATE submissions
       SET project_id = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, projectId],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async updateSubmissionStatus(id: string, status: string): Promise<Submission | null> {
    const db = getPool();
    const result = await db.query<SubmissionRow>(
      `UPDATE submissions
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async listSubmissions(filters: SubmissionFilters): Promise<Submission[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.writerId) {
      values.push(filters.writerId);
      conditions.push(`writer_id = $${values.length}`);
    }
    if (filters.projectId) {
      values.push(filters.projectId);
      conditions.push(`project_id = $${values.length}`);
    }
    if (filters.competitionId) {
      values.push(filters.competitionId);
      conditions.push(`competition_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }

    let query = `SELECT * FROM submissions`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += ` ORDER BY created_at DESC`;

    const result = await db.query<SubmissionRow>(query, values);
    return result.rows.map(mapSubmission);
  }

  async createPlacement(submissionId: string, status: string): Promise<Placement> {
    const db = getPool();
    const id = `placement_${randomUUID()}`;
    const result = await db.query<PlacementRow>(
      `INSERT INTO placements (id, submission_id, status, verification_state)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [id, submissionId, status],
    );
    return mapPlacement(result.rows[0]!);
  }

  async getPlacement(id: string): Promise<Placement | null> {
    const db = getPool();
    const result = await db.query<PlacementRow>(
      `SELECT * FROM placements WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapPlacement(result.rows[0]) : null;
  }

  async updatePlacementVerification(id: string, verificationState: string): Promise<Placement | null> {
    const db = getPool();
    const result = await db.query<PlacementRow>(
      `UPDATE placements
       SET verification_state = $2,
           updated_at = NOW(),
           verified_at = CASE
             WHEN $2 = 'verified' THEN NOW()
             ELSE NULL
           END
       WHERE id = $1
       RETURNING *`,
      [id, verificationState],
    );
    return result.rows[0] ? mapPlacement(result.rows[0]) : null;
  }

  async listPlacementsBySubmission(submissionId: string): Promise<Placement[]> {
    const db = getPool();
    const result = await db.query<PlacementRow>(
      `SELECT * FROM placements
       WHERE submission_id = $1
       ORDER BY created_at DESC`,
      [submissionId],
    );
    return result.rows.map(mapPlacement);
  }

  async listPlacements(filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.submissionId) {
      values.push(filters.submissionId);
      conditions.push(`p.submission_id = $${values.length}`);
    }
    if (filters.writerId) {
      values.push(filters.writerId);
      conditions.push(`s.writer_id = $${values.length}`);
    }
    if (filters.projectId) {
      values.push(filters.projectId);
      conditions.push(`s.project_id = $${values.length}`);
    }
    if (filters.competitionId) {
      values.push(filters.competitionId);
      conditions.push(`s.competition_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (filters.verificationState) {
      values.push(filters.verificationState);
      conditions.push(`p.verification_state = $${values.length}`);
    }

    let query = `
      SELECT
        p.id AS placement_id,
        p.submission_id AS placement_submission_id,
        p.status AS placement_status,
        p.verification_state AS placement_verification_state,
        p.created_at AS placement_created_at,
        p.updated_at AS placement_updated_at,
        p.verified_at AS placement_verified_at,
        s.id AS submission_id,
        s.writer_id AS submission_writer_id,
        s.project_id AS submission_project_id,
        s.competition_id AS submission_competition_id,
        s.status AS submission_status,
        s.created_at AS submission_created_at,
        s.updated_at AS submission_updated_at
      FROM placements p
      INNER JOIN submissions s ON s.id = p.submission_id
    `;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await db.query<PlacementWithSubmissionRow>(query, values);
    return result.rows.map((row: PlacementWithSubmissionRow) => ({
      placement: mapPlacement({
        id: row.placement_id,
        submission_id: row.placement_submission_id,
        status: row.placement_status,
        verification_state: row.placement_verification_state,
        created_at: row.placement_created_at,
        updated_at: row.placement_updated_at,
        verified_at: row.placement_verified_at,
      }),
      submission: mapSubmission({
        id: row.submission_id,
        writer_id: row.submission_writer_id,
        project_id: row.submission_project_id,
        competition_id: row.submission_competition_id,
        status: row.submission_status,
        created_at: row.submission_created_at,
        updated_at: row.submission_updated_at,
      }),
    }));
  }
}

type SubmissionRow = {
  id: string;
  writer_id: string;
  project_id: string;
  competition_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type PlacementRow = {
  id: string;
  submission_id: string;
  status: string;
  verification_state: string;
  created_at: Date;
  updated_at: Date;
  verified_at: Date | null;
};

type PlacementWithSubmissionRow = {
  placement_id: string;
  placement_submission_id: string;
  placement_status: string;
  placement_verification_state: string;
  placement_created_at: Date;
  placement_updated_at: Date;
  placement_verified_at: Date | null;
  submission_id: string;
  submission_writer_id: string;
  submission_project_id: string;
  submission_competition_id: string;
  submission_status: string;
  submission_created_at: Date;
  submission_updated_at: Date;
};

function mapSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    writerId: row.writer_id,
    projectId: row.project_id,
    competitionId: row.competition_id,
    status: row.status as Submission["status"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapPlacement(row: PlacementRow): Placement {
  return {
    id: row.id,
    submissionId: row.submission_id,
    status: row.status as Placement["status"],
    verificationState: row.verification_state as Placement["verificationState"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    verifiedAt: row.verified_at?.toISOString() ?? null,
  };
}
