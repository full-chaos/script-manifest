import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Placement, PlacementFilters, Submission, SubmissionFilters } from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { SubmissionTrackingRepository } from "./repository.js";

class MemorySubmissionTrackingRepository implements SubmissionTrackingRepository {
  private readonly submissions = new Map<string, Submission>();
  private readonly placements = new Map<string, Placement>();

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
      updatedAt: now,
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async getSubmission(id: string): Promise<Submission | null> {
    return this.submissions.get(id) ?? null;
  }

  async updateSubmissionProject(id: string, projectId: string): Promise<Submission | null> {
    const submission = this.submissions.get(id);
    if (!submission) {
      return null;
    }
    const updated: Submission = {
      ...submission,
      projectId,
      updatedAt: new Date().toISOString(),
    };
    this.submissions.set(id, updated);
    return updated;
  }

  async updateSubmissionStatus(id: string, status: string): Promise<Submission | null> {
    const submission = this.submissions.get(id);
    if (!submission) {
      return null;
    }
    const updated: Submission = {
      ...submission,
      status: status as Submission["status"],
      updatedAt: new Date().toISOString(),
    };
    this.submissions.set(id, updated);
    return updated;
  }

  async listSubmissions(filters: SubmissionFilters): Promise<Submission[]> {
    return Array.from(this.submissions.values()).filter((submission) => {
      if (filters.writerId && submission.writerId !== filters.writerId) {
        return false;
      }
      if (filters.projectId && submission.projectId !== filters.projectId) {
        return false;
      }
      if (filters.competitionId && submission.competitionId !== filters.competitionId) {
        return false;
      }
      if (filters.status && submission.status !== filters.status) {
        return false;
      }
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
    };
    this.placements.set(placement.id, placement);
    return placement;
  }

  async getPlacement(id: string): Promise<Placement | null> {
    return this.placements.get(id) ?? null;
  }

  async updatePlacementVerification(id: string, verificationState: string): Promise<Placement | null> {
    const placement = this.placements.get(id);
    if (!placement) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: Placement = {
      ...placement,
      verificationState: verificationState as Placement["verificationState"],
      updatedAt: now,
      verifiedAt: verificationState === "verified" ? now : null,
    };
    this.placements.set(id, updated);
    return updated;
  }

  async listPlacementsBySubmission(submissionId: string): Promise<Placement[]> {
    return Array.from(this.placements.values()).filter((placement) => placement.submissionId === submissionId);
  }

  async listPlacements(filters: PlacementFilters): Promise<{ placement: Placement; submission: Submission }[]> {
    return Array.from(this.placements.values()).flatMap((placement) => {
      const submission = this.submissions.get(placement.submissionId);
      if (!submission) {
        return [];
      }

      if (filters.submissionId && placement.submissionId !== filters.submissionId) {
        return [];
      }
      if (filters.writerId && submission.writerId !== filters.writerId) {
        return [];
      }
      if (filters.projectId && submission.projectId !== filters.projectId) {
        return [];
      }
      if (filters.competitionId && submission.competitionId !== filters.competitionId) {
        return [];
      }
      if (filters.status && placement.status !== filters.status) {
        return [];
      }
      if (filters.verificationState && placement.verificationState !== filters.verificationState) {
        return [];
      }

      return [{ placement, submission }];
    });
  }
}

test("submission tracking create/list/placement/verify flow", async (t) => {
  const memoryRepo = new MemorySubmissionTrackingRepository();
  const server = buildServer({ logger: false, repository: memoryRepo });
  t.after(async () => {
    await server.close();
  });

  const createSubmissionResponse = await server.inject({
    method: "POST",
    url: "/internal/submissions",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });

  assert.equal(createSubmissionResponse.statusCode, 201);
  const submissionId = createSubmissionResponse.json().submission.id as string;

  const listResponse = await server.inject({
    method: "GET",
    url: "/internal/submissions?writerId=writer_01"
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().submissions.length, 1);

  const placementResponse = await server.inject({
    method: "POST",
    url: `/internal/submissions/${submissionId}/placements`,
    payload: { status: "quarterfinalist" }
  });
  assert.equal(placementResponse.statusCode, 201);
  const placementId = placementResponse.json().placement.id as string;

  const verifyResponse = await server.inject({
    method: "POST",
    url: `/internal/placements/${placementId}/verify`,
    payload: { verificationState: "verified" }
  });

  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyResponse.json().placement.verificationState, "verified");

  const bySubmission = await server.inject({
    method: "GET",
    url: `/internal/submissions/${submissionId}/placements`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(bySubmission.statusCode, 200);
  assert.equal(bySubmission.json().placements.length, 1);
  assert.equal(bySubmission.json().placements[0].writerId, "writer_01");

  const placementDetail = await server.inject({
    method: "GET",
    url: `/internal/placements/${placementId}`,
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(placementDetail.statusCode, 200);
  assert.equal(placementDetail.json().placement.id, placementId);

  const placementList = await server.inject({
    method: "GET",
    url: "/internal/placements?writerId=writer_01&verificationState=verified",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(placementList.statusCode, 200);
  assert.equal(placementList.json().placements.length, 1);

  const reassignResponse = await server.inject({
    method: "PATCH",
    url: `/internal/submissions/${submissionId}/project`,
    headers: { "x-auth-user-id": "writer_01" },
    payload: { projectId: "project_02" }
  });
  assert.equal(reassignResponse.statusCode, 200);
  assert.equal(reassignResponse.json().submission.projectId, "project_02");
});

test("submission tracking enforces placement visibility by writer", async (t) => {
  const memoryRepo = new MemorySubmissionTrackingRepository();
  const server = buildServer({ logger: false, repository: memoryRepo });
  t.after(async () => {
    await server.close();
  });

  const submission = await server.inject({
    method: "POST",
    url: "/internal/submissions",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {
      projectId: "project_01",
      competitionId: "comp_001",
      status: "pending"
    }
  });
  const submissionId = submission.json().submission.id as string;

  const placement = await server.inject({
    method: "POST",
    url: `/internal/submissions/${submissionId}/placements`,
    payload: { status: "finalist" }
  });
  const placementId = placement.json().placement.id as string;

  const forbiddenList = await server.inject({
    method: "GET",
    url: "/internal/placements?writerId=writer_01",
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(forbiddenList.statusCode, 403);

  const forbiddenDetail = await server.inject({
    method: "GET",
    url: `/internal/placements/${placementId}`,
    headers: { "x-auth-user-id": "writer_02" }
  });
  assert.equal(forbiddenDetail.statusCode, 403);
});
