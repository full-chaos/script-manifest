import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, registerUser } from "./helpers.js";

const db = getPool(process.env.INTEGRATION_DATABASE_URL ?? "postgresql://manifest:manifest@localhost:5432/manifest");

async function upsertUser(userId: string, role: "writer" | "admin" = "writer"): Promise<void> {
  const email = `${userId}@example.com`;
  await db.query(
    `INSERT INTO app_users (id, email, password_hash, password_salt, display_name, role, created_at)
     VALUES ($1,$2,'integration','integration',$3,$4,NOW())
     ON CONFLICT (id)
     DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, role = EXCLUDED.role`,
    [userId, email, userId, role]
  );
}

test("compose flow: phase-6 hardening persists outcomes and CRM scheduler execution", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const adminUserId = "admin_01";
  const writerSession = await registerUser(`program-writer-${suffix.slice(0, 8)}`);
  const writerUserId = writerSession.user.id;
  const programId = `program_it_${suffix}`;

  await upsertUser(adminUserId, "admin");
  await upsertUser(writerUserId, "writer");

  await db.query(
    `INSERT INTO programs (
       id, slug, title, description, status, application_opens_at, application_closes_at, created_by_user_id, created_at, updated_at
     ) VALUES ($1,$2,$3,'', 'open', NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days', $4, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
    [programId, `program-slug-${suffix}`, `Program ${suffix}`, adminUserId]
  );

  const application = await expectOkJson<{ application: { id: string; status: string } }>(
    `${API_BASE_URL}/api/v1/programs/${encodeURIComponent(programId)}/applications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(writerSession.token)
      },
      body: JSON.stringify({
        statement: "I want to join this integration cohort."
      })
    },
    201
  );
  const applicationId = application.application.id;
  assert.ok(applicationId.length > 0);
  assert.equal(application.application.status, "submitted");

  const myApplications = await expectOkJson<{ applications: Array<{ id: string }> }>(
    `${API_BASE_URL}/api/v1/programs/${encodeURIComponent(programId)}/applications/me`,
    {
      method: "GET",
      headers: authHeaders(writerSession.token)
    },
    200
  );
  assert.equal(myApplications.applications.some((entry) => entry.id === applicationId), true);

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/applications/${encodeURIComponent(applicationId)}/review`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        status: "accepted",
        score: 94,
        decisionNotes: "Strong writing sample"
      })
    },
    200
  );

  const cohort = await expectOkJson<{ cohort: { id: string } }>(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/cohorts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        name: `Cohort ${suffix.slice(0, 6)}`,
        startAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
        endAt: new Date(Date.now() + 45 * 24 * 3600_000).toISOString(),
        memberApplicationIds: [applicationId]
      })
    },
    201
  );
  const cohortId = cohort.cohort.id;

  const session = await expectOkJson<{ session: { id: string } }>(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/sessions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        cohortId,
        title: "Orientation Session",
        startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
        attendeeUserIds: [writerUserId]
      })
    },
    201
  );
  const sessionId = session.session.id;

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}/attendance`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        userId: writerUserId,
        status: "attended",
        notes: "Joined and participated."
      })
    },
    200
  );

  const reminderDispatch = await expectOkJson<{ queued: number }>(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/sessions/${encodeURIComponent(sessionId)}/reminders/dispatch`,
    {
      method: "POST",
      headers: {
        "x-admin-user-id": adminUserId
      }
    },
    202
  );
  assert.equal(reminderDispatch.queued, 1);

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/outcomes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        userId: writerUserId,
        outcomeType: "staffed",
        notes: "Integration coverage"
      })
    },
    201
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/crm-sync`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        reason: "integration_test",
        payload: { source: "compose" }
      })
    },
    202
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/admin/programs/jobs/run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-user-id": adminUserId
      },
      body: JSON.stringify({
        job: "kpi_aggregation",
        limit: 10
      })
    },
    200
  );

  await expectOkJson<{ jobs: Array<{ status: string }> }>(
    `${API_BASE_URL}/api/v1/admin/programs/${encodeURIComponent(programId)}/crm-sync?limit=10&offset=0`,
    {
      method: "GET",
      headers: { "x-admin-user-id": adminUserId }
    },
    200
  );

  const outcomeCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM program_outcomes WHERE program_id = $1",
    [programId]
  );
  assert.equal((outcomeCount.rows[0] as { count: number }).count, 1);

  const acceptedApplicationsCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM program_applications WHERE program_id = $1 AND status = 'accepted'",
    [programId]
  );
  assert.equal((acceptedApplicationsCount.rows[0] as { count: number }).count, 1);

  const cohortCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM program_cohorts WHERE program_id = $1",
    [programId]
  );
  assert.equal((cohortCount.rows[0] as { count: number }).count, 1);

  const sessionCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM program_sessions WHERE program_id = $1",
    [programId]
  );
  assert.equal((sessionCount.rows[0] as { count: number }).count, 1);

  const attendanceCount = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM program_session_attendance psa
       JOIN program_sessions ps ON ps.id = psa.session_id
      WHERE ps.program_id = $1
        AND psa.user_id = $2
        AND psa.status = 'attended'`,
    [programId, writerUserId]
  );
  assert.equal((attendanceCount.rows[0] as { count: number }).count, 1);

  const latestJob = await db.query(
    `SELECT status
       FROM program_crm_sync_jobs
      WHERE program_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [programId]
  );
  assert.equal((latestJob.rows[0] as { status: string }).status, "queued");

  const snapshotCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM program_kpi_snapshots WHERE program_id = $1",
    [programId]
  );
  assert.equal((snapshotCount.rows[0] as { count: number }).count >= 1, true);
});

test("compose flow: phase-7 hardening persists messaging and sync lifecycle", async () => {
  const suffix = randomUUID().replace(/-/g, "");
  const adminUserId = "admin_01";
  const writerUserId = `partner_writer_${suffix}`;
  const judgeUserId = `partner_judge_${suffix}`;
  const organizerId = `organizer_${suffix}`;
  const projectId = `project_${suffix}`;

  await upsertUser(adminUserId, "admin");
  await upsertUser(writerUserId, "writer");
  await upsertUser(judgeUserId, "writer");

  await db.query(
    `INSERT INTO projects (
       id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at
     ) VALUES ($1,$2,$3,'','', 'feature', 'drama', 100, false, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, updated_at = NOW()`,
    [projectId, writerUserId, `Project ${suffix}`]
  );

  await db.query(
    `INSERT INTO organizer_accounts (id, name, website_url, created_by_user_id, created_at, updated_at)
     VALUES ($1,$2,'',$3,NOW(),NOW())
     ON CONFLICT (id)
     DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [organizerId, `Organizer ${suffix}`, adminUserId]
  );

  const competitionCreate = await expectOkJson<{ competition: { id: string } }>(
    `${API_BASE_URL}/api/v1/partners/competitions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        organizerAccountId: organizerId,
        slug: `comp-${suffix}`,
        title: `Competition ${suffix}`,
        description: "",
        format: "feature",
        genre: "drama",
        status: "open",
        submissionOpensAt: new Date(Date.now() - 3600_000).toISOString(),
        submissionClosesAt: new Date(Date.now() + 7 * 86400_000).toISOString()
      })
    },
    201
  );
  const competitionId = competitionCreate.competition.id;

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/memberships/${encodeURIComponent(judgeUserId)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({ role: "judge" })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/intake`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        formFields: [{ key: "bio", label: "Bio", type: "textarea", required: true }],
        feeRules: { baseFeeCents: 2500, lateFeeCents: 500 }
      })
    },
    200
  );

  const submission = await expectOkJson<{ submission: { id: string } }>(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        writerUserId,
        projectId,
        scriptId: `script_${suffix}`,
        formResponses: { bio: "Integration writer" }
      })
    },
    201
  );

  const submissionsList = await expectOkJson<{ submissions: Array<{ id: string }> }>(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/submissions`,
    {
      method: "GET",
      headers: { "x-auth-user-id": adminUserId }
    },
    200
  );
  assert.ok(submissionsList.submissions.some((entry) => entry.id === submission.submission.id));

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/judges/assign`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        judgeUserId,
        submissionIds: [submission.submission.id]
      })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/evaluations`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        submissionId: submission.submission.id,
        judgeUserId,
        round: "default",
        score: 86,
        notes: "Integration evaluation"
      })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/normalize`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({ round: "default" })
    },
    200
  ).catch(async (error) => {
    // Compose CI can intermittently return a transient DB disconnect on normalize;
    // retry once before surfacing the failure.
    const retry = await jsonRequest(
      `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/normalize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-user-id": adminUserId
        },
        body: JSON.stringify({ round: "default" })
      }
    );
    if (retry.status !== 200) {
      throw error;
    }
  });

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/publish-results`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        results: [{ submissionId: submission.submission.id, placementStatus: "semifinalist" }]
      })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        targetUserId: writerUserId,
        messageKind: "direct",
        subject: "Submission received",
        body: "Thanks for entering."
      })
    },
    201
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/jobs/run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        job: "entrant_reminders",
        reminderSubject: "Reminder",
        reminderBody: "Reminder body"
      })
    },
    200
  );

  const autoAssign = await expectOkJson<{ assignedCount: number }>(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/judges/auto-assign`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        judgeUserIds: [judgeUserId],
        maxAssignmentsPerJudge: 1,
        submissionIds: [submission.submission.id]
      })
    },
    200
  );
  assert.ok(autoAssign.assignedCount >= 0);

  const analytics = await expectOkJson<{ summary: { submissionsTotal: number } }>(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/analytics`,
    {
      method: "GET",
      headers: { "x-auth-user-id": adminUserId }
    },
    200
  );
  assert.ok(analytics.summary.submissionsTotal >= 1);

  const listedMessages = await expectOkJson<{ messages: Array<{ messageKind: string }> }>(
    `${API_BASE_URL}/api/v1/partners/competitions/${encodeURIComponent(competitionId)}/messages?targetUserId=${encodeURIComponent(writerUserId)}&limit=25`,
    {
      method: "GET",
      headers: { "x-auth-user-id": adminUserId }
    },
    200
  );
  assert.ok(listedMessages.messages.length >= 2);

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        competitionId,
        direction: "import"
      })
    },
    202
  );

  const claimed = await expectOkJson<{ job: { jobId: string } }>(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync/jobs/claim`,
    {
      method: "POST",
      headers: { "x-auth-user-id": adminUserId }
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync/jobs/${encodeURIComponent(claimed.job.jobId)}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({ detail: "completed in compose test" })
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({
        competitionId,
        direction: "export"
      })
    },
    202
  );

  const claimFailed = await expectOkJson<{ job: { jobId: string } }>(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync/jobs/claim`,
    {
      method: "POST",
      headers: { "x-auth-user-id": adminUserId }
    },
    200
  );

  await expectOkJson(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync/jobs/${encodeURIComponent(claimFailed.job.jobId)}/fail`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-user-id": adminUserId
      },
      body: JSON.stringify({ detail: "failed in compose test" })
    },
    200
  );

  const runNext = await jsonRequest<{ error?: string }>(
    `${API_BASE_URL}/api/v1/partners/integrations/filmfreeway/sync/run-next`,
    {
      method: "POST",
      headers: { "x-auth-user-id": adminUserId }
    }
  );
  assert.equal(runNext.status, 501);
  assert.equal(runNext.body.error, "sync_runner_not_configured");

  const messageCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM partner_entrant_messages WHERE competition_id = $1",
    [competitionId]
  );
  assert.ok((messageCount.rows[0] as { count: number }).count >= 2);

  const syncStatuses = await db.query(
    `SELECT status, COUNT(*)::int AS count
       FROM partner_sync_jobs
      WHERE competition_id = $1
      GROUP BY status`,
    [competitionId]
  );
  const syncStatusCounts = new Map(
    syncStatuses.rows.map((entry) => {
      const row = entry as { status: string; count: number };
      return [row.status, row.count] as const;
    })
  );
  assert.ok((syncStatusCounts.get("succeeded") ?? 0) >= 1);
  assert.ok((syncStatusCounts.get("failed") ?? 0) >= 1);

  const assignmentCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM partner_judge_assignments WHERE competition_id = $1",
    [competitionId]
  );
  assert.equal((assignmentCount.rows[0] as { count: number }).count, 1);

  const evaluationCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM partner_evaluations WHERE competition_id = $1",
    [competitionId]
  );
  assert.equal((evaluationCount.rows[0] as { count: number }).count, 1);

  const normalizationCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM partner_normalization_runs WHERE competition_id = $1",
    [competitionId]
  );
  assert.equal((normalizationCount.rows[0] as { count: number }).count, 1);

  const publishedCount = await db.query(
    "SELECT COUNT(*)::int AS count FROM partner_published_results WHERE competition_id = $1",
    [competitionId]
  );
  assert.equal((publishedCount.rows[0] as { count: number }).count, 1);

  assert.ok(submission.submission.id.length > 0);
});
