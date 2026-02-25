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
import type {
  ProgramApplicationForm,
  ProgramAvailabilityWindow,
  ProgramCrmSyncJobRow,
  ProgramOutcomeRow,
  ProgramScoringRubric,
  ProgramSessionIntegration,
  ProgramSessionReminderCandidate,
  ProgramsRepository
} from "./repository.js";

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
  private forms = new Map<string, ProgramApplicationForm>();
  private rubrics = new Map<string, ProgramScoringRubric>();
  private availability = new Map<string, ProgramAvailabilityWindow[]>();
  private integrations = new Map<string, ProgramSessionIntegration>();
  private outcomes = new Map<string, ProgramOutcomeRow[]>();
  private crmJobs = new Map<string, ProgramCrmSyncJobRow>();
  private notificationDedupe = new Set<string>();
  private cohortTransitionsToRun = 0;

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

  async getProgramApplicationForm(programId: string): Promise<ProgramApplicationForm> {
    return this.forms.get(programId) ?? {
      fields: [],
      updatedByUserId: "",
      updatedAt: new Date(0).toISOString()
    };
  }

  async upsertProgramApplicationForm(
    programId: string,
    adminUserId: string,
    fields: Array<Record<string, unknown>>
  ): Promise<ProgramApplicationForm | null> {
    if (!this.programs.has(programId) || !this.users.has(adminUserId)) {
      return null;
    }
    const form: ProgramApplicationForm = {
      fields,
      updatedByUserId: adminUserId,
      updatedAt: new Date().toISOString()
    };
    this.forms.set(programId, form);
    return form;
  }

  async getProgramScoringRubric(programId: string): Promise<ProgramScoringRubric> {
    return this.rubrics.get(programId) ?? {
      criteria: [],
      updatedByUserId: "",
      updatedAt: new Date(0).toISOString()
    };
  }

  async upsertProgramScoringRubric(
    programId: string,
    adminUserId: string,
    criteria: Array<Record<string, unknown>>
  ): Promise<ProgramScoringRubric | null> {
    if (!this.programs.has(programId) || !this.users.has(adminUserId)) {
      return null;
    }
    const rubric: ProgramScoringRubric = {
      criteria,
      updatedByUserId: adminUserId,
      updatedAt: new Date().toISOString()
    };
    this.rubrics.set(programId, rubric);
    return rubric;
  }

  async replaceAvailabilityWindows(
    programId: string,
    windows: Array<{ userId: string; startsAt: string; endsAt: string }>
  ): Promise<ProgramAvailabilityWindow[] | null> {
    if (!this.programs.has(programId)) {
      return null;
    }
    for (const window of windows) {
      if (!this.users.has(window.userId)) {
        return null;
      }
    }
    const now = new Date().toISOString();
    const mapped: ProgramAvailabilityWindow[] = windows.map((window, index) => ({
      id: `availability_${index + 1}`,
      userId: window.userId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      createdAt: now,
      updatedAt: now
    }));
    this.availability.set(programId, mapped);
    return mapped;
  }

  async listAvailabilityWindows(programId: string): Promise<ProgramAvailabilityWindow[]> {
    return this.availability.get(programId) ?? [];
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
    this.integrations.set(session.id, {
      sessionId: session.id,
      provider: input.provider,
      meetingUrl: input.meetingUrl ?? null,
      recordingUrl: null,
      reminderOffsetsMinutes: [60],
      updatedByUserId: adminUserId,
      updatedAt: now
    });
    return session;
  }

  async updateProgramSessionIntegration(
    programId: string,
    sessionId: string,
    adminUserId: string,
    update: Partial<Pick<ProgramSessionIntegration, "provider" | "meetingUrl" | "recordingUrl" | "reminderOffsetsMinutes">>
  ): Promise<ProgramSessionIntegration | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.programId !== programId || !this.users.has(adminUserId)) {
      return null;
    }
    const existing = this.integrations.get(sessionId) ?? {
      sessionId,
      provider: "",
      meetingUrl: null,
      recordingUrl: null,
      reminderOffsetsMinutes: [60],
      updatedByUserId: adminUserId,
      updatedAt: new Date(0).toISOString()
    };
    const integration: ProgramSessionIntegration = {
      sessionId,
      provider: update.provider ?? existing.provider,
      meetingUrl: update.meetingUrl ?? existing.meetingUrl,
      recordingUrl: update.recordingUrl ?? existing.recordingUrl,
      reminderOffsetsMinutes: update.reminderOffsetsMinutes ?? existing.reminderOffsetsMinutes,
      updatedByUserId: adminUserId,
      updatedAt: new Date().toISOString()
    };
    this.integrations.set(sessionId, integration);
    return integration;
  }

  async getProgramSessionIntegration(programId: string, sessionId: string): Promise<ProgramSessionIntegration | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.programId !== programId) {
      return null;
    }
    return this.integrations.get(sessionId) ?? null;
  }

  async listSessionAttendeeUserIds(programId: string, sessionId: string): Promise<string[] | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.programId !== programId) {
      return null;
    }
    return [...this.attendance.values()]
      .filter((entry) => entry.sessionId === sessionId)
      .map((entry) => entry.userId);
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

  async createProgramOutcome(
    programId: string,
    adminUserId: string,
    input: { userId: string; outcomeType: string; notes: string }
  ): Promise<ProgramOutcomeRow | null> {
    if (!this.programs.has(programId) || !this.users.has(adminUserId) || !this.users.has(input.userId)) {
      return null;
    }
    const next: ProgramOutcomeRow = {
      id: `program_outcome_${(this.outcomes.get(programId) ?? []).length + 1}`,
      programId,
      userId: input.userId,
      outcomeType: input.outcomeType,
      notes: input.notes,
      recordedByUserId: adminUserId,
      createdAt: new Date().toISOString()
    };
    const existing = this.outcomes.get(programId) ?? [];
    existing.push(next);
    this.outcomes.set(programId, existing);
    return next;
  }

  async queueProgramCrmSyncJob(
    programId: string,
    adminUserId: string,
    input: { reason: string; payload: Record<string, unknown>; maxAttempts?: number }
  ): Promise<ProgramCrmSyncJobRow | null> {
    if (!this.programs.has(programId) || !this.users.has(adminUserId)) {
      return null;
    }
    const now = new Date().toISOString();
    const job: ProgramCrmSyncJobRow = {
      id: `program_crm_sync_${this.crmJobs.size + 1}`,
      programId,
      status: "queued",
      reason: input.reason,
      payload: input.payload ?? {},
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 5,
      nextAttemptAt: now,
      lastError: "",
      triggeredByUserId: adminUserId,
      processedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.crmJobs.set(job.id, job);
    return job;
  }

  async listProgramCrmSyncJobs(
    programId: string,
    filters?: { status?: ProgramCrmSyncJobRow["status"]; limit?: number; offset?: number }
  ): Promise<ProgramCrmSyncJobRow[]> {
    const all = [...this.crmJobs.values()].filter((job) => job.programId === programId);
    const byStatus = filters?.status ? all.filter((job) => job.status === filters.status) : all;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 100;
    return byStatus.slice(offset, offset + limit);
  }

  async claimNextProgramCrmSyncJob(): Promise<ProgramCrmSyncJobRow | null> {
    const candidate = [...this.crmJobs.values()].find((job) =>
      (job.status === "queued" || job.status === "failed") &&
      new Date(job.nextAttemptAt).getTime() <= Date.now()
    );
    if (!candidate) {
      return null;
    }
    const next: ProgramCrmSyncJobRow = {
      ...candidate,
      status: "running",
      attempts: candidate.attempts + 1,
      updatedAt: new Date().toISOString()
    };
    this.crmJobs.set(next.id, next);
    return next;
  }

  async completeProgramCrmSyncJob(jobId: string): Promise<void> {
    const existing = this.crmJobs.get(jobId);
    if (!existing) {
      return;
    }
    this.crmJobs.set(jobId, {
      ...existing,
      status: "succeeded",
      processedAt: new Date().toISOString(),
      lastError: "",
      updatedAt: new Date().toISOString()
    });
  }

  async failProgramCrmSyncJob(jobId: string, errorMessage: string): Promise<ProgramCrmSyncJobRow | null> {
    const existing = this.crmJobs.get(jobId);
    if (!existing) {
      return null;
    }
    const status = existing.attempts >= existing.maxAttempts ? "dead_letter" : "failed";
    const next: ProgramCrmSyncJobRow = {
      ...existing,
      status,
      lastError: errorMessage,
      nextAttemptAt: new Date(Date.now() + 30_000).toISOString(),
      processedAt: status === "dead_letter" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    this.crmJobs.set(jobId, next);
    return next;
  }

  // Test helpers to verify persistence and deterministic queue transitions.
  getProgramOutcomes(programId: string): ProgramOutcomeRow[] {
    return [...(this.outcomes.get(programId) ?? [])];
  }

  getProgramCrmSyncJob(jobId: string): ProgramCrmSyncJobRow | null {
    return this.crmJobs.get(jobId) ?? null;
  }

  forceProgramCrmSyncRetryNow(jobId: string): void {
    const existing = this.crmJobs.get(jobId);
    if (!existing) {
      return;
    }
    this.crmJobs.set(jobId, {
      ...existing,
      nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  backdateApplication(programId: string, userId: string, createdAt: string): void {
    const key = `${programId}:${userId}`;
    const existing = this.applications.get(key);
    if (!existing) {
      return;
    }
    this.applications.set(key, {
      ...existing,
      createdAt,
      updatedAt: createdAt
    });
  }

  setCohortTransitionsToRun(count: number): void {
    this.cohortTransitionsToRun = Math.max(0, Math.floor(count));
  }

  async markApplicationReminderSent(programId: string, applicationId: string): Promise<void> {
    this.notificationDedupe.add(`application:${programId}:${applicationId}`);
  }

  async hasApplicationReminderBeenSent(programId: string, applicationId: string): Promise<boolean> {
    return this.notificationDedupe.has(`application:${programId}:${applicationId}`);
  }

  async listApplicationReminderCandidates(ageMinutes: number, limit: number): Promise<Array<{
    programId: string;
    applicationId: string;
    userId: string;
    status: string;
    applicationCreatedAt: string;
  }>> {
    const cutoff = Date.now() - ageMinutes * 60_000;
    return [...this.applications.values()]
      .filter((application) => new Date(application.createdAt).getTime() <= cutoff)
      .filter((application) => !this.notificationDedupe.has(`application:${application.programId}:${application.id}`))
      .slice(0, limit)
      .map((application) => ({
        programId: application.programId,
        applicationId: application.id,
        userId: application.userId,
        status: application.status,
        applicationCreatedAt: application.createdAt
      }));
  }

  async markSessionReminderSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<void> {
    this.notificationDedupe.add(`session:${programId}:${sessionId}:${userId}:${reminderOffsetMinutes}`);
  }

  async hasSessionReminderBeenSent(
    programId: string,
    sessionId: string,
    userId: string,
    reminderOffsetMinutes: number
  ): Promise<boolean> {
    return this.notificationDedupe.has(`session:${programId}:${sessionId}:${userId}:${reminderOffsetMinutes}`);
  }

  async listSessionReminderCandidates(
    horizonMinutes: number,
    lookbackMinutes: number,
    limit: number
  ): Promise<ProgramSessionReminderCandidate[]> {
    const minTime = Date.now() - lookbackMinutes * 60_000;
    const maxTime = Date.now() + horizonMinutes * 60_000;
    const results: ProgramSessionReminderCandidate[] = [];
    for (const session of this.sessions.values()) {
      const startsAtMs = new Date(session.startsAt).getTime();
      if (startsAtMs < minTime || startsAtMs > maxTime) {
        continue;
      }
      const integration = this.integrations.get(session.id) ?? {
        sessionId: session.id,
        provider: session.provider,
        meetingUrl: session.meetingUrl,
        recordingUrl: null,
        reminderOffsetsMinutes: [60],
        updatedByUserId: session.createdByUserId,
        updatedAt: session.updatedAt
      };
      const attendees = [...this.attendance.values()].filter((entry) => entry.sessionId === session.id);
      for (const attendee of attendees) {
        for (const offset of integration.reminderOffsetsMinutes) {
          results.push({
            programId: session.programId,
            sessionId: session.id,
            userId: attendee.userId,
            startsAt: session.startsAt,
            provider: integration.provider,
            meetingUrl: integration.meetingUrl,
            reminderOffsetMinutes: offset
          });
        }
      }
    }
    return results.slice(0, limit);
  }

  async runCohortTransitionJob(): Promise<number> {
    return this.cohortTransitionsToRun;
  }

  async upsertProgramKpiSnapshot(
    _programId: string,
    _snapshotDate: string,
    _metrics: Record<string, unknown>
  ): Promise<void> {}

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
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository(), schedulerEnabled: false });
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
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository(), schedulerEnabled: false });
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

test("programs service lists my applications and admin applications with required auth", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository(), schedulerEnabled: false });
  t.after(async () => {
    await server.close();
  });

  const firstApplication = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "Writer one application." }
  });
  assert.equal(firstApplication.statusCode, 201);

  const secondApplication = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_02" },
    payload: { statement: "Writer two application." }
  });
  assert.equal(secondApplication.statusCode, 201);

  const missingUserAuth = await server.inject({
    method: "GET",
    url: "/internal/programs/program_1/applications/me"
  });
  assert.equal(missingUserAuth.statusCode, 403);

  const mine = await server.inject({
    method: "GET",
    url: "/internal/programs/program_1/applications/me",
    headers: { "x-auth-user-id": "writer_01" }
  });
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.json().applications.length, 1);
  assert.equal(mine.json().applications[0]?.userId, "writer_01");

  const missingAdminAuth = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/applications"
  });
  assert.equal(missingAdminAuth.statusCode, 403);

  const adminList = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/applications",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(adminList.statusCode, 200);
  assert.equal(adminList.json().applications.length, 2);
  const userIds = new Set(
    (adminList.json().applications as Array<{ userId: string }>).map((application) => application.userId)
  );
  assert.deepEqual(userIds, new Set(["writer_01", "writer_02"]));
});

test("programs service supports forms, scheduling, reminders, and crm hooks", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository(), schedulerEnabled: false });
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

test("programs service runs scheduler jobs and supports crm status filtering", async (t) => {
  const observed: string[] = [];
  const requestFn = (async (url: string | URL) => {
    observed.push(String(url));
    return {
      statusCode: 202,
      body: {
        json: async () => ({ accepted: true }),
        text: async () => JSON.stringify({ accepted: true })
      }
    };
  }) as any;

  const server = buildServer({
    logger: false,
    repository: new MemoryProgramsRepository(),
    requestFn,
    notificationServiceBase: "http://notification-svc",
    schedulerEnabled: false
  });
  t.after(async () => {
    await server.close();
  });

  const queue = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { reason: "manual_dispatch", payload: { segment: "accepted_writers" } }
  });
  assert.equal(queue.statusCode, 202);

  const run = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "crm_sync_dispatcher", limit: 10 }
  });
  assert.equal(run.statusCode, 200);
  assert.equal(run.json().result.processed, 1);

  const succeeded = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/crm-sync?status=succeeded",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(succeeded.statusCode, 200);
  assert.equal(succeeded.json().jobs.length, 1);
  assert.equal(succeeded.json().jobs[0]?.status, "succeeded");
  assert.equal(observed[0], "http://notification-svc/internal/events");
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
    notificationServiceBase: "http://notification-svc",
    schedulerEnabled: false
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
    "http://notification-svc/internal/events"
  );
  assert.match(observed[0]?.body ?? "", /"eventType":"program_application_decision"/);
  assert.match(observed[0]?.body ?? "", /"resourceType":"program_application"/);
  assert.match(observed[0]?.body ?? "", /"programId":"program_1"/);
  assert.match(observed[0]?.body ?? "", /"status":"accepted"/);
});

test("programs service persists outcomes created through admin endpoint", async (t) => {
  const repository = new MemoryProgramsRepository();
  const server = buildServer({ logger: false, repository, schedulerEnabled: false });
  t.after(async () => {
    await server.close();
  });

  const first = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/outcomes",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      userId: "writer_01",
      outcomeType: "signed_with_manager",
      notes: "Signed after portfolio review"
    }
  });
  assert.equal(first.statusCode, 201);

  const second = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/outcomes",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      userId: "writer_02",
      outcomeType: "staffing_meeting_booked",
      notes: "Introduced by mentor"
    }
  });
  assert.equal(second.statusCode, 201);

  const outcomes = repository.getProgramOutcomes("program_1");
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0]?.recordedByUserId, "admin_01");
  assert.equal(outcomes[0]?.userId, "writer_01");
  assert.equal(outcomes[1]?.recordedByUserId, "admin_01");
  assert.equal(outcomes[1]?.userId, "writer_02");
});

test("programs service manual jobs endpoint enforces auth and payload validation", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryProgramsRepository(), schedulerEnabled: false });
  t.after(async () => {
    await server.close();
  });

  const missingAdmin = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    payload: { job: "crm_sync_dispatcher" }
  });
  assert.equal(missingAdmin.statusCode, 403);

  const invalidPayload = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "unknown_job" }
  });
  assert.equal(invalidPayload.statusCode, 400);
});

test("programs service manual jobs endpoint runs reminder and transition jobs", async (t) => {
  const repository = new MemoryProgramsRepository();
  repository.setCohortTransitionsToRun(2);

  const observedBodies: string[] = [];
  const requestFn = (async (_url: string | URL, options?: { body?: unknown }) => {
    observedBodies.push(String(options?.body ?? ""));
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
    repository,
    requestFn,
    notificationServiceBase: "http://notification-svc",
    schedulerEnabled: false
  });
  t.after(async () => {
    await server.close();
  });

  const applicationCreate = await server.inject({
    method: "POST",
    url: "/internal/programs/program_1/applications",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { statement: "Aged application for SLA reminder coverage." }
  });
  assert.equal(applicationCreate.statusCode, 201);
  repository.backdateApplication("program_1", "writer_01", new Date(Date.now() - 10 * 60_000).toISOString());

  const startsAt = new Date(Date.now() + 20 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 80 * 60_000).toISOString();
  const sessionCreate = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/sessions",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      title: "Reminder target session",
      startsAt,
      endsAt,
      attendeeUserIds: ["writer_01"]
    }
  });
  assert.equal(sessionCreate.statusCode, 201);
  const sessionId = sessionCreate.json().session.id as string;

  const integrationUpdate = await server.inject({
    method: "PATCH",
    url: `/internal/admin/programs/program_1/sessions/${sessionId}/integration`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      provider: "zoom",
      reminderOffsetsMinutes: [30]
    }
  });
  assert.equal(integrationUpdate.statusCode, 200);

  const applicationReminderRun = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      job: "application_sla_reminder",
      ageMinutes: 5,
      limit: 10
    }
  });
  assert.equal(applicationReminderRun.statusCode, 200);
  assert.equal(applicationReminderRun.json().result.job, "application_sla_reminder");
  assert.equal(applicationReminderRun.json().result.scanned, 1);
  assert.equal(applicationReminderRun.json().result.processed, 1);
  assert.equal(applicationReminderRun.json().result.failed, 0);

  const sessionReminderRun = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      job: "session_reminder",
      horizonMinutes: 120,
      lookbackMinutes: 30,
      limit: 10
    }
  });
  assert.equal(sessionReminderRun.statusCode, 200);
  assert.equal(sessionReminderRun.json().result.job, "session_reminder");
  assert.equal(sessionReminderRun.json().result.scanned, 1);
  assert.equal(sessionReminderRun.json().result.processed, 1);
  assert.equal(sessionReminderRun.json().result.failed, 0);

  const cohortTransitionRun = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "cohort_transition" }
  });
  assert.equal(cohortTransitionRun.statusCode, 200);
  assert.equal(cohortTransitionRun.json().result.job, "cohort_transition");
  assert.equal(cohortTransitionRun.json().result.scanned, 2);
  assert.equal(cohortTransitionRun.json().result.processed, 2);
  assert.equal(cohortTransitionRun.json().result.failed, 0);

  assert.equal(observedBodies.length, 2);
  assert.match(observedBodies[0] ?? "", /"eventType":"program_application_sla_reminder"/);
  assert.match(observedBodies[1] ?? "", /"eventType":"program_session_reminder"/);
});

test("programs service CRM sync queue lifecycle supports failed, succeeded, and dead-letter states", async (t) => {
  const repository = new MemoryProgramsRepository();
  let failNotifications = true;
  const requestFn = (async () => {
    if (failNotifications) {
      return {
        statusCode: 500,
        body: {
          json: async () => ({ ok: false }),
          text: async () => "forced_failure"
        }
      };
    }
    return {
      statusCode: 202,
      body: {
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true })
      }
    };
  }) as any;

  const server = buildServer({
    logger: false,
    repository,
    requestFn,
    notificationServiceBase: "http://notification-svc",
    schedulerEnabled: false
  });
  t.after(async () => {
    await server.close();
  });

  const queueFirst = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { reason: "phase_6_lifecycle" }
  });
  assert.equal(queueFirst.statusCode, 202);
  const firstJobId = queueFirst.json().job.id as string;

  const firstRun = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "crm_sync_dispatcher", limit: 1 }
  });
  assert.equal(firstRun.statusCode, 200);
  assert.equal(firstRun.json().result.failed, 1);

  const failedList = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/crm-sync?status=failed",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(failedList.statusCode, 200);
  assert.equal(failedList.json().jobs.length, 1);
  assert.equal(failedList.json().jobs[0]?.id, firstJobId);

  repository.forceProgramCrmSyncRetryNow(firstJobId);
  failNotifications = false;

  const secondRun = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/jobs/run",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { job: "crm_sync_dispatcher", limit: 1 }
  });
  assert.equal(secondRun.statusCode, 200);
  assert.equal(secondRun.json().result.processed, 1);

  const succeededList = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/crm-sync?status=succeeded",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(succeededList.statusCode, 200);
  assert.equal(succeededList.json().jobs.length, 1);
  assert.equal(succeededList.json().jobs[0]?.id, firstJobId);

  failNotifications = true;
  const queueSecond = await server.inject({
    method: "POST",
    url: "/internal/admin/programs/program_1/crm-sync",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { reason: "phase_6_dead_letter" }
  });
  assert.equal(queueSecond.statusCode, 202);
  const secondJobId = queueSecond.json().job.id as string;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      repository.forceProgramCrmSyncRetryNow(secondJobId);
    }
    const run = await server.inject({
      method: "POST",
      url: "/internal/admin/programs/jobs/run",
      headers: { "x-admin-user-id": "admin_01" },
      payload: { job: "crm_sync_dispatcher", limit: 1 }
    });
    assert.equal(run.statusCode, 200);
    assert.equal(run.json().result.failed, 1);
  }

  const secondJob = repository.getProgramCrmSyncJob(secondJobId);
  assert.equal(secondJob?.status, "dead_letter");

  const deadLetterList = await server.inject({
    method: "GET",
    url: "/internal/admin/programs/program_1/crm-sync?status=dead_letter",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(deadLetterList.statusCode, 200);
  assert.equal(deadLetterList.json().jobs.length, 1);
  assert.equal(deadLetterList.json().jobs[0]?.id, secondJobId);
});
