import { randomUUID } from "node:crypto";
import { getPool, runMigrations } from "@script-manifest/db";
import type {
  CreateHistoricalPlacementData,
  CreatePlacementEvidenceData,
  Placement,
  PlacementEvidence,
  PlacementFilters,
  PlacementVerificationUpdateData,
  Submission,
  SubmissionFilters,
} from "@script-manifest/contracts";
import type { SubmissionTrackingRepository } from "./repository.js";

export class PgSubmissionTrackingRepository implements SubmissionTrackingRepository {
  async init(): Promise<void> {
    if (process.env.SKIP_SCHEMA_INIT === "1") return;
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

  async createSubmission(data: { writerId: string; projectId: string; competitionId: string; status: string }): Promise<Submission> {
    const id = `submission_${randomUUID()}`;
    const result = await getPool().query<SubmissionRow>(
      `INSERT INTO submissions (id, writer_id, project_id, competition_id, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, data.writerId, data.projectId, data.competitionId, data.status],
    );
    return mapSubmission(result.rows[0]!);
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const result = await getPool().query<SubmissionRow>(`SELECT * FROM submissions WHERE id = $1`, [id]);
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async updateSubmissionProject(id: string, projectId: string): Promise<Submission | null> {
    const result = await getPool().query<SubmissionRow>(
      `UPDATE submissions SET project_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, projectId],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async updateSubmissionStatus(id: string, status: string): Promise<Submission | null> {
    const result = await getPool().query<SubmissionRow>(
      `UPDATE submissions SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status],
    );
    return result.rows[0] ? mapSubmission(result.rows[0]) : null;
  }

  async listSubmissions(filters: SubmissionFilters): Promise<Submission[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters.writerId) pushCondition(conditions, values, "writer_id", filters.writerId);
    if (filters.projectId) pushCondition(conditions, values, "project_id", filters.projectId);
    if (filters.competitionId) pushCondition(conditions, values, "competition_id", filters.competitionId);
    if (filters.status) pushCondition(conditions, values, "status", filters.status);

    const query = `SELECT * FROM submissions${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC`;
    const result = await getPool().query<SubmissionRow>(query, values);
    return result.rows.map(mapSubmission);
  }

  async createPlacement(submissionId: string, status: string): Promise<Placement> {
    const id = `placement_${randomUUID()}`;
    const result = await getPool().query<PlacementRow>(
      `INSERT INTO placements (id, submission_id, status, verification_state)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [id, submissionId, status],
    );
    return mapPlacement(result.rows[0]!);
  }

  async createHistoricalPlacement(data: CreateHistoricalPlacementData): Promise<{ submission: Submission; placement: Placement }> {
    const db = getPool();
    const submissionId = `submission_${randomUUID()}`;
    const placementId = `placement_${randomUUID()}`;
    const competitionId = data.competitionId ?? `historical:${data.competitionNameFreeform}`;

    const result = await db.query<HistoricalPlacementRow>(
      `WITH created_submission AS (
         INSERT INTO submissions (id, writer_id, project_id, competition_id, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       ), created_placement AS (
         INSERT INTO placements (id, submission_id, status, verification_state, is_historical, source_note, recorded_by_user_id)
         VALUES ($6, $1, $5, 'pending', TRUE, $7, $2)
         RETURNING *
       )
       ${selectPlacementWithSubmission("created_placement", "created_submission")}`,
      [submissionId, data.recordedByUserId, data.projectId, competitionId, data.status, placementId, data.sourceNote]
    );

    const mapped = mapPlacementWithSubmission(result.rows[0]!);
    for (const item of data.evidenceItems) {
      await this.createPlacementEvidence({ placementId: mapped.placement.id, uploadedByUserId: data.recordedByUserId, ...item });
    }
    return mapped;
  }

  async getPlacement(id: string): Promise<Placement | null> {
    const result = await getPool().query<PlacementRow>(`SELECT * FROM placements WHERE id = $1`, [id]);
    return result.rows[0] ? mapPlacement(result.rows[0]) : null;
  }

  async updatePlacementVerification(id: string, data: PlacementVerificationUpdateData): Promise<Placement | null> {
    const result = await getPool().query<PlacementRow>(
      `UPDATE placements
       SET verification_state = $2,
           updated_at = NOW(),
           verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE NULL END,
           reviewed_by_user_id = $3::text,
           reviewed_at = CASE WHEN $3::text IS NOT NULL THEN NOW() ELSE reviewed_at END,
           review_notes = $4::text
       WHERE id = $1
       RETURNING *`,
      [id, data.verificationState, data.reviewedByUserId ?? null, data.reviewNotes ?? null],
    );
    return result.rows[0] ? mapPlacement(result.rows[0]) : null;
  }

  async createPlacementEvidence(data: CreatePlacementEvidenceData): Promise<PlacementEvidence> {
    const id = `evidence_${randomUUID()}`;
    const result = await getPool().query<PlacementEvidenceRow>(
      `INSERT INTO placement_evidence (id, placement_id, script_id, evidence_url, kind, caption, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, data.placementId, data.scriptId ?? null, data.evidenceUrl ?? null, data.kind, data.caption ?? null, data.uploadedByUserId],
    );
    return mapPlacementEvidence(result.rows[0]!);
  }

  async listPlacementEvidence(placementId: string): Promise<PlacementEvidence[]> {
    const result = await getPool().query<PlacementEvidenceRow>(
      `SELECT * FROM placement_evidence WHERE placement_id = $1 ORDER BY created_at DESC`,
      [placementId],
    );
    return result.rows.map(mapPlacementEvidence);
  }

  async listPlacementsBySubmission(submissionId: string): Promise<Placement[]> {
    const result = await getPool().query<PlacementRow>(
      `SELECT * FROM placements WHERE submission_id = $1 ORDER BY created_at DESC`,
      [submissionId],
    );
    return result.rows.map(mapPlacement);
  }

  async listPlacements(filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters.submissionId) pushCondition(conditions, values, "p.submission_id", filters.submissionId);
    if (filters.writerId) pushCondition(conditions, values, "s.writer_id", filters.writerId);
    if (filters.projectId) pushCondition(conditions, values, "s.project_id", filters.projectId);
    if (filters.competitionId) pushCondition(conditions, values, "s.competition_id", filters.competitionId);
    if (filters.status) pushCondition(conditions, values, "p.status", filters.status);
    if (filters.verificationState) pushCondition(conditions, values, "p.verification_state", filters.verificationState);
    if (filters.isHistorical !== undefined) pushCondition(conditions, values, "p.is_historical", filters.isHistorical);

    const query = `${selectPlacementWithSubmission("p", "s")}
      FROM placements p
      INNER JOIN submissions s ON s.id = p.submission_id
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY p.created_at DESC`;
    const result = await getPool().query<PlacementWithSubmissionRow>(query, values);
    return result.rows.map(mapPlacementWithSubmission);
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
  is_historical?: boolean;
  source_note?: string | null;
  recorded_by_user_id?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: Date | null;
  review_notes?: string | null;
};

type PlacementWithSubmissionRow = {
  placement_id: string;
  placement_submission_id: string;
  placement_status: string;
  placement_verification_state: string;
  placement_created_at: Date;
  placement_updated_at: Date;
  placement_verified_at: Date | null;
  placement_is_historical: boolean;
  placement_source_note: string | null;
  placement_recorded_by_user_id: string | null;
  placement_reviewed_by_user_id: string | null;
  placement_reviewed_at: Date | null;
  placement_review_notes: string | null;
  submission_id: string;
  submission_writer_id: string;
  submission_project_id: string;
  submission_competition_id: string;
  submission_status: string;
  submission_created_at: Date;
  submission_updated_at: Date;
};

type HistoricalPlacementRow = PlacementWithSubmissionRow;

type PlacementEvidenceRow = {
  id: string;
  placement_id: string;
  script_id: string | null;
  evidence_url: string | null;
  kind: string;
  caption: string | null;
  uploaded_by_user_id: string;
  created_at: Date;
  updated_at: Date;
};

function pushCondition(conditions: string[], values: unknown[], column: string, value: unknown): void {
  values.push(value);
  conditions.push(`${column} = $${values.length}`);
}

function selectPlacementWithSubmission(placementAlias: string, submissionAlias: string): string {
  return `SELECT
    ${placementAlias}.id AS placement_id,
    ${placementAlias}.submission_id AS placement_submission_id,
    ${placementAlias}.status AS placement_status,
    ${placementAlias}.verification_state AS placement_verification_state,
    ${placementAlias}.created_at AS placement_created_at,
    ${placementAlias}.updated_at AS placement_updated_at,
    ${placementAlias}.verified_at AS placement_verified_at,
    ${placementAlias}.is_historical AS placement_is_historical,
    ${placementAlias}.source_note AS placement_source_note,
    ${placementAlias}.recorded_by_user_id AS placement_recorded_by_user_id,
    ${placementAlias}.reviewed_by_user_id AS placement_reviewed_by_user_id,
    ${placementAlias}.reviewed_at AS placement_reviewed_at,
    ${placementAlias}.review_notes AS placement_review_notes,
    ${submissionAlias}.id AS submission_id,
    ${submissionAlias}.writer_id AS submission_writer_id,
    ${submissionAlias}.project_id AS submission_project_id,
    ${submissionAlias}.competition_id AS submission_competition_id,
    ${submissionAlias}.status AS submission_status,
    ${submissionAlias}.created_at AS submission_created_at,
    ${submissionAlias}.updated_at AS submission_updated_at`;
}

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
    isHistorical: row.is_historical ?? false,
    sourceNote: row.source_note ?? null,
    recordedByUserId: row.recorded_by_user_id ?? null,
    reviewedByUserId: row.reviewed_by_user_id ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewNotes: row.review_notes ?? null,
  };
}

function mapPlacementWithSubmission(row: PlacementWithSubmissionRow): { placement: Placement; submission: Submission } {
  return {
    placement: mapPlacement({
      id: row.placement_id,
      submission_id: row.placement_submission_id,
      status: row.placement_status,
      verification_state: row.placement_verification_state,
      created_at: row.placement_created_at,
      updated_at: row.placement_updated_at,
      verified_at: row.placement_verified_at,
      is_historical: row.placement_is_historical,
      source_note: row.placement_source_note,
      recorded_by_user_id: row.placement_recorded_by_user_id,
      reviewed_by_user_id: row.placement_reviewed_by_user_id,
      reviewed_at: row.placement_reviewed_at,
      review_notes: row.placement_review_notes,
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
  };
}

function mapPlacementEvidence(row: PlacementEvidenceRow): PlacementEvidence {
  return {
    id: row.id,
    placementId: row.placement_id,
    scriptId: row.script_id,
    evidenceUrl: row.evidence_url,
    kind: row.kind as PlacementEvidence["kind"],
    caption: row.caption,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
