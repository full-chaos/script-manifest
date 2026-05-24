import assert from "node:assert/strict";
import test from "node:test";
import type {
  Placement,
  PlacementFilters,
  PlacementVerificationState,
  Submission,
  SubmissionFilters,
  SubmissionStatus
} from "@script-manifest/contracts";
import type { SubmissionTrackingRepository } from "./repository.js";

class MemorySubmissionTrackingRepository implements SubmissionTrackingRepository {
  private readonly submissions = new Map<string, Submission>();
  private readonly placements = new Map<string, Placement>();
  private submissionCount = 0;
  private placementCount = 0;

  async init(): Promise<void> {}

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async createSubmission(data: {
    writerId: string;
    projectId: string;
    competitionId: string;
    status: string;
  }): Promise<Submission> {
    const now = new Date("2026-03-01T00:00:00.000Z").toISOString();
    const submission: Submission = {
      id: `submission_${++this.submissionCount}`,
      writerId: data.writerId,
      projectId: data.projectId,
      competitionId: data.competitionId,
      status: data.status as SubmissionStatus,
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
      updatedAt: new Date("2026-03-02T00:00:00.000Z").toISOString(),
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
      status: status as SubmissionStatus,
      updatedAt: new Date("2026-03-03T00:00:00.000Z").toISOString(),
    };
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
    const now = new Date("2026-03-04T00:00:00.000Z").toISOString();
    const placement: Placement = {
      id: `placement_${++this.placementCount}`,
      submissionId,
      status: status as SubmissionStatus,
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

    const now = new Date("2026-03-05T00:00:00.000Z").toISOString();
    const updated: Placement = {
      ...placement,
      verificationState: verificationState as PlacementVerificationState,
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

      if (filters.submissionId && placement.submissionId !== filters.submissionId) return [];
      if (filters.writerId && submission.writerId !== filters.writerId) return [];
      if (filters.projectId && submission.projectId !== filters.projectId) return [];
      if (filters.competitionId && submission.competitionId !== filters.competitionId) return [];
      if (filters.status && placement.status !== filters.status) return [];
      if (filters.verificationState && placement.verificationState !== filters.verificationState) return [];

      return [{ placement, submission }];
    });
  }
}

test("SubmissionTrackingRepository supports the submission and placement lifecycle", async () => {
  const repo = new MemorySubmissionTrackingRepository();

  await repo.init();
  assert.deepEqual(await repo.healthCheck(), { database: true });

  const submission = await repo.createSubmission({
    writerId: "writer_1",
    projectId: "project_1",
    competitionId: "comp_1",
    status: "pending",
  });

  assert.equal(submission.id, "submission_1");
  assert.equal(submission.status, "pending");
  assert.equal((await repo.getSubmission(submission.id))?.writerId, "writer_1");

  const projectUpdated = await repo.updateSubmissionProject(submission.id, "project_2");
  assert.equal(projectUpdated?.projectId, "project_2");

  const statusUpdated = await repo.updateSubmissionStatus(submission.id, "semifinalist");
  assert.equal(statusUpdated?.status, "semifinalist");

  const placement = await repo.createPlacement(submission.id, "quarterfinalist");
  assert.equal(placement.id, "placement_1");
  assert.equal(placement.verificationState, "pending");

  const verified = await repo.updatePlacementVerification(placement.id, "verified");
  assert.equal(verified?.verificationState, "verified");
  assert.ok(verified?.verifiedAt);

  const submissions = await repo.listSubmissions({ writerId: "writer_1", projectId: "project_2" });
  assert.equal(submissions.length, 1);

  const placementsBySubmission = await repo.listPlacementsBySubmission(submission.id);
  assert.equal(placementsBySubmission.length, 1);

  const placements = await repo.listPlacements({
    writerId: "writer_1",
    projectId: "project_2",
    verificationState: "verified",
  });
  assert.equal(placements.length, 1);
  assert.equal(placements[0]?.submission.id, submission.id);
  assert.equal(placements[0]?.placement.id, placement.id);
});

test("SubmissionTrackingRepository returns null when records are missing", async () => {
  const repo = new MemorySubmissionTrackingRepository();

  assert.equal(await repo.getSubmission("missing"), null);
  assert.equal(await repo.getPlacement("missing"), null);
  assert.equal(await repo.updateSubmissionProject("missing", "project_1"), null);
  assert.equal(await repo.updateSubmissionStatus("missing", "semifinalist"), null);
  assert.equal(await repo.updatePlacementVerification("missing", "verified"), null);
  assert.deepEqual(await repo.listSubmissions({ writerId: "missing" }), []);
  assert.deepEqual(await repo.listPlacements({ writerId: "missing" }), []);
});
