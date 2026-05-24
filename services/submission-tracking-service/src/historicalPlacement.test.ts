import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  CreateHistoricalPlacementData,
  CreatePlacementEvidenceData,
  Placement,
  PlacementEvidence,
  PlacementFilters,
  PlacementVerificationUpdateData,
  Submission,
  SubmissionFilters
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { SubmissionTrackingRepository } from "./repository.js";

class MemoryHistoricalPlacementRepository implements SubmissionTrackingRepository {
  private readonly submissions = new Map<string, Submission>();
  private readonly placements = new Map<string, Placement>();
  private readonly evidence = new Map<string, PlacementEvidence>();

  async init(): Promise<void> {
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async createSubmission(data: {
    writerId: string;
    projectId: string;
    competitionId: string;
    status: string;
  }): Promise<Submission> {
    const now = new Date().toISOString();
    const submission: Submission = {
      id: `submission_${randomUUID()}`,
      writerId: data.writerId,
      projectId: data.projectId,
      competitionId: data.competitionId,
      status: data.status as Submission["status"],
      createdAt: now,
      updatedAt: now
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async getSubmission(id: string): Promise<Submission | null> {
    return this.submissions.get(id) ?? null;
  }

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

  async listSubmissions(filters: SubmissionFilters): Promise<Submission[]> {
    return Array.from(this.submissions.values()).filter((submission) => {
      if (filters.writerId && submission.writerId !== filters.writerId) return false;
      if (filters.projectId && submission.projectId !== filters.projectId) return false;
      if (filters.competitionId && submission.competitionId !== filters.competitionId) return false;
      if (filters.status && submission.status !== filters.status) return false;
      return true;
    });
  }

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
      isHistorical: false,
      sourceNote: null,
      recordedByUserId: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNotes: null
    };
    this.placements.set(placement.id, placement);
    return placement;
  }

  async createHistoricalPlacement(data: CreateHistoricalPlacementData): Promise<{ submission: Submission; placement: Placement }> {
    const submission = await this.createSubmission({
      writerId: data.recordedByUserId,
      projectId: data.projectId,
      competitionId: data.competitionId ?? `historical:${data.competitionNameFreeform}`,
      status: data.status
    });
    const now = new Date().toISOString();
    const placement: Placement = {
      id: `placement_${randomUUID()}`,
      submissionId: submission.id,
      status: data.status,
      verificationState: "pending",
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      isHistorical: true,
      sourceNote: data.sourceNote,
      recordedByUserId: data.recordedByUserId,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNotes: null
    };
    this.placements.set(placement.id, placement);
    for (const item of data.evidenceItems) {
      await this.createPlacementEvidence({
        placementId: placement.id,
        uploadedByUserId: data.recordedByUserId,
        ...item
      });
    }
    return { submission, placement };
  }

  async getPlacement(id: string): Promise<Placement | null> {
    return this.placements.get(id) ?? null;
  }

  async updatePlacementVerification(id: string, data: PlacementVerificationUpdateData): Promise<Placement | null> {
    const placement = this.placements.get(id);
    if (!placement) return null;
    const now = new Date().toISOString();
    const updated: Placement = {
      ...placement,
      verificationState: data.verificationState,
      updatedAt: now,
      verifiedAt: data.verificationState === "verified" ? now : null,
      reviewedByUserId: data.reviewedByUserId ?? null,
      reviewedAt: data.reviewedByUserId ? now : null,
      reviewNotes: data.reviewNotes ?? null
    };
    this.placements.set(id, updated);
    return updated;
  }

  async createPlacementEvidence(data: CreatePlacementEvidenceData): Promise<PlacementEvidence> {
    const now = new Date().toISOString();
    const evidence: PlacementEvidence = {
      id: `evidence_${randomUUID()}`,
      placementId: data.placementId,
      scriptId: data.scriptId ?? null,
      evidenceUrl: data.evidenceUrl ?? null,
      kind: data.kind,
      caption: data.caption ?? null,
      uploadedByUserId: data.uploadedByUserId,
      createdAt: now,
      updatedAt: now
    };
    this.evidence.set(evidence.id, evidence);
    return evidence;
  }

  async listPlacementEvidence(placementId: string): Promise<PlacementEvidence[]> {
    return Array.from(this.evidence.values()).filter((entry) => entry.placementId === placementId);
  }

  async listPlacementsBySubmission(submissionId: string): Promise<Placement[]> {
    return Array.from(this.placements.values()).filter((placement) => placement.submissionId === submissionId);
  }

  async listPlacements(filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]> {
    return Array.from(this.placements.values()).flatMap((placement) => {
      const submission = this.submissions.get(placement.submissionId);
      if (!submission) return [];
      if (filters.submissionId && placement.submissionId !== filters.submissionId) return [];
      if (filters.writerId && submission.writerId !== filters.writerId) return [];
      if (filters.projectId && submission.projectId !== filters.projectId) return [];
      if (filters.competitionId && submission.competitionId !== filters.competitionId) return [];
      if (filters.status && placement.status !== filters.status) return [];
      if (filters.verificationState && placement.verificationState !== filters.verificationState) return [];
      if (filters.isHistorical !== undefined && placement.isHistorical !== filters.isHistorical) return [];
      return [{ placement, submission }];
    });
  }
}

test("creates a pending historical placement with evidence and reviewer approval", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryHistoricalPlacementRepository() });
  t.after(async () => {
    await server.close();
  });

  const createResponse = await server.inject({
    method: "POST",
    url: "/internal/placements/historical",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "competition_01",
      status: "finalist",
      placementDate: "2024-05-15",
      sourceNote: "Published finalist list screenshot from 2024.",
      evidenceItems: [
        {
          scriptId: "script_evidence_01",
          kind: "pdf",
          caption: "Finalist announcement PDF"
        }
      ]
    }
  });

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.json().placement.isHistorical, true);
  assert.equal(createResponse.json().placement.verificationState, "pending");
  assert.equal(createResponse.json().placement.sourceNote, "Published finalist list screenshot from 2024.");
  assert.equal(createResponse.json().evidence.length, 1);
  assert.equal(createResponse.json().evidence[0].kind, "pdf");
  assert.equal(createResponse.json().evidence[0].uploadedByUserId, "writer_01");
  const placementId = createResponse.json().placement.id as string;

  const evidenceResponse = await server.inject({
    method: "GET",
    url: `/internal/placements/${placementId}/evidence`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(evidenceResponse.statusCode, 200);
  assert.equal(evidenceResponse.json().evidence.length, 1);

  const approveResponse = await server.inject({
    method: "POST",
    url: `/internal/placements/${placementId}/verify`,
    headers: { "x-auth-user-id": "admin_01" },
    payload: {
      verificationState: "verified",
      reviewedByUserId: "admin_01",
      reviewNotes: "Evidence matches competition result page."
    }
  });

  assert.equal(approveResponse.statusCode, 200);
  assert.equal(approveResponse.json().placement.verificationState, "verified");
  assert.equal(approveResponse.json().placement.reviewedByUserId, "admin_01");
  assert.equal(approveResponse.json().placement.reviewNotes, "Evidence matches competition result page.");
  assert.match(approveResponse.json().placement.badgeLabel, /Verified/);
});

test("rejects unsupported placement evidence kinds", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryHistoricalPlacementRepository() });
  t.after(async () => {
    await server.close();
  });

  const createResponse = await server.inject({
    method: "POST",
    url: "/internal/placements/historical",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "competition_01",
      status: "semifinalist",
      placementDate: "2024-05-15",
      sourceNote: "Archive note.",
      evidenceItems: [
        {
          kind: "spreadsheet",
          evidenceUrl: "https://example.com/results",
          caption: "Invalid evidence kind"
        }
      ]
    }
  });

  assert.equal(createResponse.statusCode, 400);
  assert.equal(createResponse.json().error, "invalid_payload");
});
