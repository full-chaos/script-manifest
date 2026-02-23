import assert from "node:assert/strict";
import test from "node:test";
import type {
  Program,
  ProgramApplication,
  ProgramApplicationCreateRequest,
  ProgramApplicationReviewRequest
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { ProgramsRepository } from "./repository.js";

class MemoryProgramsRepository implements ProgramsRepository {
  private users = new Set<string>(["writer_01", "admin_01"]);
  private programs = new Map<string, Program>([
    [
      "program_1",
      {
        id: "program_1",
        slug: "career-lab-spring-2026",
        title: "Career Lab Spring 2026",
        description: "Workshop series",
        status: "open",
        applicationOpensAt: "2026-01-01T00:00:00.000Z",
        applicationClosesAt: "2027-01-01T00:00:00.000Z",
        createdByUserId: "admin_01",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]
  ]);
  private applications = new Map<string, ProgramApplication>();

  async init(): Promise<void> {}

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async listPrograms(status?: Program["status"]): Promise<Program[]> {
    const values = [...this.programs.values()];
    if (!status) {
      return values;
    }
    return values.filter((program) => program.status === status);
  }

  async listProgramApplications(programId: string): Promise<ProgramApplication[]> {
    return [...this.applications.values()].filter((application) => application.programId === programId);
  }

  async listUserProgramApplications(programId: string, userId: string): Promise<ProgramApplication[]> {
    return [...this.applications.values()].filter(
      (application) => application.programId === programId && application.userId === userId
    );
  }

  async createProgramApplication(
    programId: string,
    userId: string,
    input: ProgramApplicationCreateRequest
  ): Promise<ProgramApplication | null> {
    if (!this.users.has(userId) || !this.programs.has(programId)) {
      return null;
    }
    const now = new Date().toISOString();
    const key = `${programId}:${userId}`;
    const existing = this.applications.get(key);
    const next: ProgramApplication = {
      id: existing?.id ?? `program_application_${this.applications.size + 1}`,
      programId,
      userId,
      statement: input.statement,
      sampleProjectId: input.sampleProjectId ?? null,
      status: "submitted",
      score: null,
      decisionNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.applications.set(key, next);
    return next;
  }

  async reviewProgramApplication(
    programId: string,
    applicationId: string,
    reviewerUserId: string,
    input: ProgramApplicationReviewRequest
  ): Promise<ProgramApplication | null> {
    if (!this.users.has(reviewerUserId)) {
      return null;
    }
    const found = [...this.applications.values()].find(
      (application) => application.id === applicationId && application.programId === programId
    );
    if (!found) {
      return null;
    }
    const next: ProgramApplication = {
      ...found,
      status: input.status,
      score: input.score ?? null,
      decisionNotes: input.decisionNotes || null,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.applications.set(`${programId}:${found.userId}`, next);
    return next;
  }
}

test("programs service lists programs and supports apply/review flow", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository() });
  t.after(async () => {
    await server.close();
  });

  const list = await server.inject({
    method: "GET",
    url: "/internal/programs?status=open"
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().programs.length, 1);

  const applied = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "I want to join the program.", sampleProjectId: "project_01" }
  });
  assert.equal(applied.statusCode, 201);
  const applicationId = applied.json().application.id as string;

  const mine = await server.inject({
    method: "GET",
    url: "/internal/programs/program_1/applications/me",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.json().applications.length, 1);

  const reviewed = await server.inject({
    method: "POST",
    url: `/internal/admin/programs/program_1/applications/${applicationId}/review`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", score: 92, decisionNotes: "Strong sample and clear goals." }
  });
  assert.equal(reviewed.statusCode, 200);
  assert.equal(reviewed.json().application.status, "accepted");
});
