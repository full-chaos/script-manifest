import assert from "node:assert/strict";
import test from "node:test";
import type {
  Program,
  ProgramAnalyticsSummary,
  ProgramApplication,
  ProgramApplicationCreateRequest,
  ProgramApplicationReviewRequest,
  ProgramCohort,
  ProgramCohortCreateRequest,
  ProgramMentorshipMatch,
  ProgramMentorshipMatchCreateRequest,
  ProgramSession,
  ProgramSessionAttendance,
  ProgramSessionAttendanceUpsertRequest,
  ProgramSessionCreateRequest
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { ProgramsRepository } from "./repository.js";

class MemoryProgramsRepository implements ProgramsRepository {
  private users = new Set<string>(["writer_01", "writer_02", "mentor_01", "admin_01"]);
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
  private cohorts = new Map<string, ProgramCohort>();
  private sessions = new Map<string, ProgramSession>();
  private attendance = new Map<string, ProgramSessionAttendance>();
  private mentorship = new Map<string, ProgramMentorshipMatch>();

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

  async listProgramCohorts(programId: string): Promise<ProgramCohort[]> {
    return [...this.cohorts.values()].filter((cohort) => cohort.programId === programId);
  }

  async createProgramCohort(
    programId: string,
    adminUserId: string,
    input: ProgramCohortCreateRequest
  ): Promise<ProgramCohort | null> {
    if (!this.users.has(adminUserId) || !this.programs.has(programId)) {
      return null;
    }
    const now = new Date().toISOString();
    const cohort: ProgramCohort = {
      id: `program_cohort_${this.cohorts.size + 1}`,
      programId,
      name: input.name,
      summary: input.summary,
      startAt: input.startAt,
      endAt: input.endAt,
      capacity: input.capacity ?? null,
      createdByUserId: adminUserId,
      createdAt: now,
      updatedAt: now
    };
    this.cohorts.set(cohort.id, cohort);
    return cohort;
  }

  async createProgramSession(
    programId: string,
    adminUserId: string,
    input: ProgramSessionCreateRequest
  ): Promise<ProgramSession | null> {
    if (!this.users.has(adminUserId) || !this.programs.has(programId)) {
      return null;
    }
    const now = new Date().toISOString();
    const session: ProgramSession = {
      id: `program_session_${this.sessions.size + 1}`,
      programId,
      cohortId: input.cohortId ?? null,
      title: input.title,
      description: input.description,
      sessionType: input.sessionType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      provider: input.provider,
      meetingUrl: input.meetingUrl ?? null,
      createdByUserId: adminUserId,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.id, session);
    for (const userId of input.attendeeUserIds) {
      const key = `${session.id}:${userId}`;
      this.attendance.set(key, {
        sessionId: session.id,
        userId,
        status: "invited",
        notes: "",
        markedByUserId: null,
        markedAt: null,
        createdAt: now,
        updatedAt: now
      });
    }
    return session;
  }

  async upsertSessionAttendance(
    programId: string,
    sessionId: string,
    adminUserId: string,
    input: ProgramSessionAttendanceUpsertRequest
  ): Promise<ProgramSessionAttendance | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.programId !== programId || !this.users.has(adminUserId) || !this.users.has(input.userId)) {
      return null;
    }
    const now = new Date().toISOString();
    const key = `${sessionId}:${input.userId}`;
    const existing = this.attendance.get(key);
    const next: ProgramSessionAttendance = {
      sessionId,
      userId: input.userId,
      status: input.status,
      notes: input.notes,
      markedByUserId: adminUserId,
      markedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.attendance.set(key, next);
    return next;
  }

  async createMentorshipMatches(
    programId: string,
    adminUserId: string,
    input: ProgramMentorshipMatchCreateRequest
  ): Promise<ProgramMentorshipMatch[] | null> {
    if (!this.users.has(adminUserId) || !this.programs.has(programId)) {
      return null;
    }
    const now = new Date().toISOString();
    const created: ProgramMentorshipMatch[] = [];
    for (const match of input.matches) {
      if (!this.users.has(match.mentorUserId) || !this.users.has(match.menteeUserId)) {
        return null;
      }
      const next: ProgramMentorshipMatch = {
        id: `program_mentorship_${this.mentorship.size + 1}`,
        programId,
        cohortId: input.cohortId ?? null,
        mentorUserId: match.mentorUserId,
        menteeUserId: match.menteeUserId,
        status: "active",
        notes: match.notes,
        createdByUserId: adminUserId,
        createdAt: now,
        updatedAt: now
      };
      this.mentorship.set(next.id, next);
      created.push(next);
    }
    return created;
  }

  async getProgramAnalytics(programId: string): Promise<ProgramAnalyticsSummary | null> {
    if (!this.programs.has(programId)) {
      return null;
    }
    const applications = [...this.applications.values()].filter((app) => app.programId === programId);
    const cohorts = [...this.cohorts.values()].filter((cohort) => cohort.programId === programId);
    const sessions = [...this.sessions.values()].filter((session) => session.programId === programId);
    const attendance = [...this.attendance.values()].filter((entry) =>
      sessions.some((session) => session.id === entry.sessionId)
    );
    const mentorship = [...this.mentorship.values()].filter((entry) => entry.programId === programId);

    const invited = attendance.length;
    const attended = attendance.filter((entry) => entry.status === "attended").length;

    return {
      applicationsSubmitted: applications.length,
      applicationsUnderReview: applications.filter((app) => app.status === "under_review").length,
      applicationsAccepted: applications.filter((app) => app.status === "accepted").length,
      applicationsWaitlisted: applications.filter((app) => app.status === "waitlisted").length,
      applicationsRejected: applications.filter((app) => app.status === "rejected").length,
      cohortsTotal: cohorts.length,
      cohortMembersActive: applications.filter((app) => app.status === "accepted").length,
      sessionsScheduled: sessions.length,
      sessionsCompleted: sessions.filter((session) => new Date(session.endsAt).getTime() < Date.now()).length,
      attendanceInvited: invited,
      attendanceMarked: attendance.filter((entry) => entry.status !== "invited").length,
      attendanceAttended: attended,
      attendanceRate: invited > 0 ? attended / invited : 0,
      mentorshipMatchesActive: mentorship.filter((entry) => entry.status === "active").length,
      mentorshipMatchesCompleted: mentorship.filter((entry) => entry.status === "completed").length
    };
  }
}

test("programs service supports application, cohorts, sessions, mentorship and analytics flows", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository() });
  t.after(async () => {
    await server.close();
  });

  const apply = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "I want to join the program.", sampleProjectId: "project_01" }
  });
  assert.equal(apply.statusCode, 201);
  const applicationId = apply.json().application.id as string;

  const reviewed = await server.inject({
    method: "POST",
    url: `/internal/admin/programs/program_1/applications/${applicationId}/review`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", score: 92, decisionNotes: "Strong sample and clear goals." }
  });
  assert.equal(reviewed.statusCode, 200);
  assert.equal(reviewed.json().application.status, "accepted");

  const cohort = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/cohorts",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      name: "Cohort A",
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-08-01T00:00:00.000Z",
      memberApplicationIds: [applicationId]
    }
  });
  assert.equal(cohort.statusCode, 201);
  const cohortId = cohort.json().cohort.id as string;

  const session = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/sessions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      cohortId,
      title: "Live Workshop",
      startsAt: "2026-06-15T17:00:00.000Z",
      endsAt: "2026-06-15T18:00:00.000Z",
      attendeeUserIds: ["writer_01"]
    }
  });
  assert.equal(session.statusCode, 201);
  const sessionId = session.json().session.id as string;

  const attendance = await server.inject({
    method: "POST",
    url: `/internal/admin/programs/program_1/sessions/${sessionId}/attendance`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      userId: "writer_01",
      status: "attended",
      notes: "Strong engagement"
    }
  });
  assert.equal(attendance.statusCode, 200);
  assert.equal(attendance.json().attendance.status, "attended");

  const mentorship = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/mentorship/matches",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      cohortId,
      matches: [{ mentorUserId: "mentor_01", menteeUserId: "writer_01", notes: "Pilot mentorship" }]
    }
  });
  assert.equal(mentorship.statusCode, 201);
  assert.equal(mentorship.json().matches.length, 1);

  const analytics = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(analytics.statusCode, 200);
  assert.equal(analytics.json().summary.applicationsAccepted, 1);
});
