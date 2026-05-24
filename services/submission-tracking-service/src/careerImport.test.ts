import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  CareerImportPreviewRow,
  CommitCareerImportData,
  CreateCareerImportPreviewData,
  CreateHistoricalPlacementData,
  CreatePlacementEvidenceData,
  ImportCommitResponse,
  ImportPreviewResponse,
  Placement,
  PlacementEvidence,
  PlacementFilters,
  PlacementVerificationUpdateData,
  Submission,
  SubmissionFilters
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { SubmissionTrackingRepository } from "./repository.js";

class MemoryCareerImportRepository implements SubmissionTrackingRepository {
  readonly submissions = new Map<string, Submission>();
  readonly placements = new Map<string, Placement>();
  private readonly previews = new Map<string, ImportPreviewResponse>();

  async init(): Promise<void> {}
  async healthCheck(): Promise<{ database: boolean }> { return { database: true }; }

  async createSubmission(data: { writerId: string; projectId: string; competitionId: string; status: string }): Promise<Submission> {
    const now = new Date().toISOString();
    const submission: Submission = {
      id: `submission_${randomUUID()}`,
      writerId: data.writerId,
      projectId: data.projectId,
      competitionId: data.competitionId,
      status: data.status as Submission["status"],
      createdAt: now,
      updatedAt: now,
      importSource: "recovered_csv"
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async getSubmission(id: string): Promise<Submission | null> { return this.submissions.get(id) ?? null; }
  async updateSubmissionProject(id: string, projectId: string): Promise<Submission | null> {
    const submission = this.submissions.get(id);
    if (!submission) return null;
    const updated = { ...submission, projectId, updatedAt: new Date().toISOString() };
    this.submissions.set(id, updated);
    return updated;
  }
  async updateSubmissionStatus(id: string, status: string): Promise<Submission | null> {
    const submission = this.submissions.get(id);
    if (!submission) return null;
    const updated = { ...submission, status: status as Submission["status"], updatedAt: new Date().toISOString() };
    this.submissions.set(id, updated);
    return updated;
  }
  async listSubmissions(_filters: SubmissionFilters): Promise<Submission[]> { return Array.from(this.submissions.values()); }

  async createPlacement(submissionId: string, status: string): Promise<Placement> {
    const now = new Date().toISOString();
    const placement: Placement = {
      id: `placement_${randomUUID()}`,
      submissionId,
      status: status as Placement["status"],
      verificationState: "pending",
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      isHistorical: true,
      sourceNote: null,
      recordedByUserId: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNotes: null,
      importSource: "recovered_csv"
    };
    this.placements.set(placement.id, placement);
    return placement;
  }
  async createHistoricalPlacement(_data: CreateHistoricalPlacementData): Promise<{ submission: Submission; placement: Placement }> { throw new Error("not needed"); }
  async getPlacement(id: string): Promise<Placement | null> { return this.placements.get(id) ?? null; }
  async updatePlacementVerification(_id: string, _data: PlacementVerificationUpdateData): Promise<Placement | null> { return null; }
  async createPlacementEvidence(_data: CreatePlacementEvidenceData): Promise<PlacementEvidence> { throw new Error("not needed"); }
  async listPlacementEvidence(_placementId: string): Promise<PlacementEvidence[]> { return []; }
  async listPlacementsBySubmission(submissionId: string): Promise<Placement[]> { return Array.from(this.placements.values()).filter((p) => p.submissionId === submissionId); }
  async listPlacements(_filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]> { return []; }

  async createCareerImportPreview(data: CreateCareerImportPreviewData): Promise<ImportPreviewResponse> {
    const rows: CareerImportPreviewRow[] = data.rows.map((row, rowIndex) => {
      const errors: string[] = [];
      if (!row.project_title?.trim()) errors.push("project_title is required");
      if (!row.competition_name?.trim()) errors.push("competition_name is required");
      if (!/^\d{4}$/.test(row.year?.trim() ?? "")) errors.push("year must be a 4-digit year");
      if (!row.status?.trim()) errors.push("status is required");
      if (row.status && !["pending", "quarterfinalist", "semifinalist", "finalist", "winner"].includes(row.status.trim())) errors.push("status is not supported");
      return { rowIndex, row, status: errors.length === 0 ? "ok" : "error", errors };
    });
    const preview: ImportPreviewResponse = {
      batch: {
        id: `import_${randomUUID()}`,
        writerId: data.writerId,
        filename: data.filename,
        rowCount: rows.length,
        succeeded: rows.filter((row) => row.status === "ok").length,
        failed: rows.filter((row) => row.status === "error").length,
        status: "validated",
        errorLog: rows,
        createdAt: new Date().toISOString(),
        committedAt: null
      },
      rows
    };
    this.previews.set(preview.batch.id, preview);
    return preview;
  }

  async getCareerImport(batchId: string, _writerId: string): Promise<ImportPreviewResponse | null> {
    return this.previews.get(batchId) ?? null;
  }

  async commitCareerImport(data: CommitCareerImportData): Promise<ImportCommitResponse> {
    const preview = this.previews.get(data.batchId);
    if (!preview) throw new Error("batch not found");
    for (const row of preview.rows.filter((entry) => data.acceptedRowIndices.includes(entry.rowIndex) && entry.status === "ok")) {
      const submission = await this.createSubmission({
        writerId: data.writerId,
        projectId: `project:${row.row.project_title}`,
        competitionId: `competition:${row.row.competition_name}`,
        status: row.row.status as Submission["status"]
      });
      const importedSubmission = { ...submission, importBatchId: data.batchId };
      this.submissions.set(importedSubmission.id, importedSubmission);
      const placement = await this.createPlacement(submission.id, row.row.status);
      this.placements.set(placement.id, { ...placement, importBatchId: data.batchId });
    }
    return { batchId: data.batchId, committed: data.acceptedRowIndices.length, skipped: 0 };
  }
}

test("previews a valid recovered career CSV", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryCareerImportRepository() });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/internal/career-imports?filename=career.csv",
    headers: { "x-auth-user-id": "writer_01", "content-type": "text/csv" },
    payload: [
      "project_title,competition_name,year,status,placement_date,source_url,source_note",
      "Pilot One,Austin Film Festival,2023,finalist,2023-10-15,https://example.com/results,Archived PDF",
      "Pilot Two,Sundance Lab,2022,semifinalist,,https://example.com/sundance,Recovered from Coverfly",
      "Pilot Three,Nicholl Fellowship,2021,winner,2021-12-01,,"
    ].join("\n")
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().rows.length, 3);
  assert.equal(response.json().batch.succeeded, 3);
  assert.equal(response.json().rows[0].status, "ok");
});

test("previews invalid rows without committing them", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryCareerImportRepository() });
  t.after(async () => { await server.close(); });

  const response = await server.inject({
    method: "POST",
    url: "/internal/career-imports",
    headers: { "x-auth-user-id": "writer_01", "content-type": "text/csv" },
    payload: [
      "project_title,competition_name,year,status,placement_date,source_url,source_note",
      "Pilot One,Austin Film Festival,2023,not-a-placement,,,"
    ].join("\n")
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().batch.failed, 1);
  assert.equal(response.json().rows[0].status, "error");
  assert.match(response.json().rows[0].errors.join(" "), /status/);
});

test("commits accepted recovered CSV rows as historical submissions and placements", async (t) => {
  const repository = new MemoryCareerImportRepository();
  const server = buildServer({ logger: false, repository });
  t.after(async () => { await server.close(); });

  const previewResponse = await server.inject({
    method: "POST",
    url: "/internal/career-imports",
    headers: { "x-auth-user-id": "writer_01", "content-type": "text/csv" },
    payload: [
      "project_title,competition_name,year,status,placement_date,source_url,source_note",
      "Pilot One,Austin Film Festival,2023,finalist,2023-10-15,https://example.com/results,Archived PDF",
      "Pilot Two,Sundance Lab,2022,semifinalist,,https://example.com/sundance,Recovered from Coverfly",
      "Pilot Three,Nicholl Fellowship,2021,not-a-placement,,,"
    ].join("\n")
  });
  const batchId = previewResponse.json().batch.id as string;

  const commitResponse = await server.inject({
    method: "POST",
    url: `/internal/career-imports/${encodeURIComponent(batchId)}/commit`,
    headers: { "x-auth-user-id": "writer_01" },
    payload: { batchId, acceptedRowIndices: [0, 1] }
  });

  assert.equal(commitResponse.statusCode, 200);
  assert.equal(commitResponse.json().committed, 2);
  assert.equal(repository.submissions.size, 2);
  assert.equal(repository.placements.size, 2);
  for (const submission of repository.submissions.values()) {
    assert.equal(submission.importSource, "recovered_csv");
    assert.equal(submission.importBatchId, batchId);
  }
  for (const placement of repository.placements.values()) {
    assert.equal(placement.importSource, "recovered_csv");
    assert.equal(placement.importBatchId, batchId);
    assert.equal(placement.isHistorical, true);
    assert.equal(placement.verificationState, "pending");
  }
});
