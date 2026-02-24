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

test("programs service enforces auth, validation, and not-found paths", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository() });
  t.after(async () => {
    await server.close();
  });

  const invalidStatus = await server.inject({
    method: "GET",
    url: "/internal/programs?status=unknown"
  });
  assert.equal(invalidStatus.statusCode, 400);

  const missingAuth = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    payload: { statement: "hello" }
  });
  assert.equal(missingAuth.statusCode, 403);

  const invalidApplicationPayload = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: {}
  });
  assert.equal(invalidApplicationPayload.statusCode, 400);

  const unknownProgram = await server.inject({
    method: "POST",
    url: "/internal/programs/program_unknown/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "hello" }
  });
  assert.equal(unknownProgram.statusCode, 404);

  const reviewMissingAdmin = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/applications/app_404/review",
    payload: { status: "accepted" }
  });
  assert.equal(reviewMissingAdmin.statusCode, 403);

  const reviewNotFound = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/applications/app_404/review",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted" }
  });
  assert.equal(reviewNotFound.statusCode, 404);

  const invalidCohortPayload = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/cohorts",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { name: "" }
  });
  assert.equal(invalidCohortPayload.statusCode, 400);

  const invalidSessionPayload = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/sessions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { title: "Session only" }
  });
  assert.equal(invalidSessionPayload.statusCode, 400);

  const attendanceMissingSession = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/sessions/session_404/attendance",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { userId: "writer_01", status: "attended" }
  });
  assert.equal(attendanceMissingSession.statusCode, 404);

  const mentorshipUnknownUser = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/mentorship/matches",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      matches: [{ mentorUserId: "missing_mentor", menteeUserId: "writer_01" }]
    }
  });
  assert.equal(mentorshipUnknownUser.statusCode, 404);

  const analyticsUnknownProgram = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_404/analytics",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(analyticsUnknownProgram.statusCode, 404);
});

test("programs service supports forms, scheduling, reminders, and crm hooks", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository() });
  t.after(async () => {
    await server.close();
  });

  const formUpsert = await server.inject({
    method: "PUT",
    url: "/internal/admin/programs/program_1/application-form",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      fields: [
        { key: "goals", label: "Goals", type: "textarea", required: true },
        { key: "sample", label: "Sample Link", type: "url", required: false }
      ]
    }
  });
  assert.equal(formUpsert.statusCode, 200);

  const formGet = await server.inject({
    method: "GET",
    url: "/internal/programs/program_1/application-form"
  });
  assert.equal(formGet.statusCode, 200);
  assert.equal(formGet.json().form.fields.length, 2);

  const rubricUpsert = await server.inject({
    method: "PUT",
    url: "/internal/admin/programs/program_1/scoring-rubric",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      criteria: [
        { key: "voice", label: "Voice", weight: 0.5, maxScore: 100 },
        { key: "structure", label: "Structure", weight: 0.5, maxScore: 100 }
      ]
    }
  });
  assert.equal(rubricUpsert.statusCode, 200);

  const availability = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/availability",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      windows: [
        {
          userId: "writer_01",
          startsAt: "2026-06-20T16:00:00.000Z",
          endsAt: "2026-06-20T18:00:00.000Z"
        },
        {
          userId: "writer_02",
          startsAt: "2026-06-20T17:00:00.000Z",
          endsAt: "2026-06-20T19:00:00.000Z"
        }
      ]
    }
  });
  assert.equal(availability.statusCode, 200);

  const match = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/scheduling/match",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      attendeeUserIds: ["writer_01", "writer_02"],
      durationMinutes: 45
    }
  });
  assert.equal(match.statusCode, 200);
  assert.equal(match.json().match.attendeeUserIds.length, 2);

  const session = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/sessions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      title: "Mentor Session",
      startsAt: "2026-06-20T17:00:00.000Z",
      endsAt: "2026-06-20T18:00:00.000Z",
      attendeeUserIds: ["writer_01", "writer_02"]
    }
  });
  assert.equal(session.statusCode, 201);
  const sessionId = session.json().session.id as string;

  const integration = await server.inject({
    method: "PATCH",
    url: `/internal/admin/programs/program_1/sessions/${sessionId}/integration`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      provider: "zoom",
      meetingUrl: "https://example.com/zoom/session",
      recordingUrl: "https://example.com/recordings/session",
      reminderOffsetsMinutes: [120, 30]
    }
  });
  assert.equal(integration.statusCode, 200);

  const reminders = await server.inject({
    method: "POST",
    url: `/internal/admin/programs/program_1/sessions/${sessionId}/reminders/dispatch`,
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(reminders.statusCode, 202);
  assert.equal(reminders.json().queued, 2);

  const outcome = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/outcomes",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      userId: "writer_01",
      outcomeType: "signed_with_manager",
      notes: "Signed after pitch week"
    }
  });
  assert.equal(outcome.statusCode, 201);

  const crm = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { reason: "weekly_follow_up" }
  });
  assert.equal(crm.statusCode, 202);

  const crmList = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(crmList.statusCode, 200);
  assert.equal(crmList.json().jobs.length, 1);
});

test("programs service review flow triggers applicant decision notification hook", async (t) => {
  const observed: Array<{ url: string; body: string }> = [];
  const requestFn = (async (url: string | URL, options?: { body?: unknown }) => {
    observed.push({ url: String(url), body: String(options?.body ?? "") });
    return {
      statusCode: 202,
      body: {
        json: async () => ({ queued: true }),
        text: async () => JSON.stringify({ queued: true })
      }
    };
  }) as any;

  const server = buildServer({
    logger: false,
    repository: new MemoryProgramsRepository(),
    requestFn,
    notificationServiceBase: "http://notification-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const apply = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "Application for review hook test." }
  });
  assert.equal(apply.statusCode, 201);
  const applicationId = apply.json().application.id as string;

  const review = await server.inject({
    method: "POST",
    url: `/internal/admin/programs/program_1/applications/${applicationId}/review`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "accepted", score: 95, decisionNotes: "Strong fit for cohort." }
  });
  assert.equal(review.statusCode, 200);

  assert.equal(observed.length, 1);
  assert.equal(
    observed[0]?.url,
    "http://notification-svc/internal/notifications/program-application-decision"
  );
  assert.match(observed[0]?.body ?? "", /"programId":"program_1"/);
  assert.match(observed[0]?.body ?? "", /"applicationId":"program_application_/);
  assert.match(observed[0]?.body ?? "", /"status":"accepted"/);
});
