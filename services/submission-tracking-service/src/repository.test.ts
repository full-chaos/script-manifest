import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    runMigrations: async () => undefined
  }
});

const { PgSubmissionTrackingRepository } = await import("./pgRepository.js");

function submissionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "submission_1",
    writer_id: "writer_1",
    project_id: "project_1",
    competition_id: "comp_1",
    status: "pending",
    created_at: new Date("2026-03-01T00:00:00.000Z"),
    updated_at: new Date("2026-03-02T00:00:00.000Z"),
    ...overrides
  };
}

function placementRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "placement_1",
    submission_id: "submission_1",
    status: "quarterfinalist",
    verification_state: "pending",
    created_at: new Date("2026-03-03T00:00:00.000Z"),
    updated_at: new Date("2026-03-04T00:00:00.000Z"),
    verified_at: null,
    is_historical: false,
    source_note: null,
    recorded_by_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: null,
    ...overrides
  };
}

test("PgSubmissionTrackingRepository updates and retrieves submissions", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];

  queryImpl = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes("SELECT * FROM submissions WHERE id = $1")) {
      return { rows: [submissionRow()] };
    }
    if (sql.includes("SET project_id = $2")) {
      return { rows: [submissionRow({ project_id: "project_2" })], rowCount: 1 };
    }
    if (sql.includes("SET status = $2")) {
      return { rows: [submissionRow({ status: "semifinalist" })], rowCount: 1 };
    }
    return { rows: [] };
  };

  const repo = new PgSubmissionTrackingRepository();
  const submission = await repo.getSubmission("submission_1");
  const projectUpdated = await repo.updateSubmissionProject("submission_1", "project_2");
  const statusUpdated = await repo.updateSubmissionStatus("submission_1", "semifinalist");

  assert.equal(submission?.writerId, "writer_1");
  assert.equal(projectUpdated?.projectId, "project_2");
  assert.equal(statusUpdated?.status, "semifinalist");
  assert.deepEqual(calls.map((call) => call.values), [
    ["submission_1"],
    ["submission_1", "project_2"],
    ["submission_1", "semifinalist"]
  ]);
});

test("PgSubmissionTrackingRepository creates and verifies placements", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];

  queryImpl = async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes("INSERT INTO placements")) {
      assert.match(String(values[0]), /^placement_/);
      return { rows: [placementRow({ id: values[0] })], rowCount: 1 };
    }
    if (sql.includes("SELECT * FROM placements WHERE id = $1")) {
      return { rows: [placementRow()] };
    }
    if (sql.includes("SET verification_state = $2")) {
      return {
        rows: [placementRow({ verification_state: "verified", verified_at: new Date("2026-03-05T00:00:00.000Z") })],
        rowCount: 1
      };
    }
    if (sql.includes("WHERE submission_id = $1")) {
      return { rows: [placementRow()] };
    }
    return { rows: [] };
  };

  const repo = new PgSubmissionTrackingRepository();
  const created = await repo.createPlacement("submission_1", "quarterfinalist");
  const placement = await repo.getPlacement("placement_1");
  const verified = await repo.updatePlacementVerification("placement_1", { verificationState: "verified" });
  const bySubmission = await repo.listPlacementsBySubmission("submission_1");

  assert.equal(created.submissionId, "submission_1");
  assert.equal(placement?.status, "quarterfinalist");
  assert.equal(verified?.verificationState, "verified");
  assert.equal(verified?.verifiedAt, "2026-03-05T00:00:00.000Z");
  assert.equal(bySubmission.length, 1);
  assert.deepEqual(calls.map((call) => call.values.slice(-2)), [
    ["submission_1", "quarterfinalist"],
    ["placement_1"],
    [null, null],
    ["submission_1"]
  ]);
});

test("PgSubmissionTrackingRepository listPlacements builds joined filters and maps rows", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return {
      rows: [
        {
          placement_id: "placement_1",
          placement_submission_id: "submission_1",
          placement_status: "quarterfinalist",
          placement_verification_state: "verified",
          placement_created_at: new Date("2026-03-03T00:00:00.000Z"),
          placement_updated_at: new Date("2026-03-04T00:00:00.000Z"),
          placement_verified_at: new Date("2026-03-05T00:00:00.000Z"),
          placement_is_historical: true,
          placement_source_note: "Archive note",
          placement_recorded_by_user_id: "writer_1",
          placement_reviewed_by_user_id: "admin_1",
          placement_reviewed_at: new Date("2026-03-06T00:00:00.000Z"),
          placement_review_notes: "Looks good",
          submission_id: "submission_1",
          submission_writer_id: "writer_1",
          submission_project_id: "project_1",
          submission_competition_id: "comp_1",
          submission_status: "semifinalist",
          submission_created_at: new Date("2026-03-01T00:00:00.000Z"),
          submission_updated_at: new Date("2026-03-02T00:00:00.000Z")
        }
      ]
    };
  };

  const repo = new PgSubmissionTrackingRepository();
  const placements = await repo.listPlacements({
    submissionId: "submission_1",
    writerId: "writer_1",
    projectId: "project_1",
    competitionId: "comp_1",
    status: "quarterfinalist",
    verificationState: "verified",
    isHistorical: true
  });

  assert.match(capturedSql, /INNER JOIN submissions s ON s.id = p.submission_id/);
  assert.match(capturedSql, /p.submission_id = \$1/);
  assert.match(capturedSql, /s.writer_id = \$2/);
  assert.match(capturedSql, /s.project_id = \$3/);
  assert.match(capturedSql, /s.competition_id = \$4/);
  assert.match(capturedSql, /p.status = \$5/);
  assert.match(capturedSql, /p.verification_state = \$6/);
  assert.match(capturedSql, /p.is_historical = \$7/);
  assert.deepEqual(capturedValues, ["submission_1", "writer_1", "project_1", "comp_1", "quarterfinalist", "verified", true]);
  assert.deepEqual(placements, [
    {
      placement: {
        id: "placement_1",
        submissionId: "submission_1",
        status: "quarterfinalist",
        verificationState: "verified",
        createdAt: "2026-03-03T00:00:00.000Z",
        updatedAt: "2026-03-04T00:00:00.000Z",
        verifiedAt: "2026-03-05T00:00:00.000Z",
        isHistorical: true,
        sourceNote: "Archive note",
        recordedByUserId: "writer_1",
        reviewedByUserId: "admin_1",
        reviewedAt: "2026-03-06T00:00:00.000Z",
        reviewNotes: "Looks good"
      },
      submission: {
        id: "submission_1",
        writerId: "writer_1",
        projectId: "project_1",
        competitionId: "comp_1",
        status: "semifinalist",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z"
      }
    }
  ]);
});

test("PgSubmissionTrackingRepository returns null when updates miss", async () => {
  queryImpl = async () => ({ rows: [], rowCount: 0 });

  const repo = new PgSubmissionTrackingRepository();

  assert.equal(await repo.getSubmission("missing"), null);
  assert.equal(await repo.getPlacement("missing"), null);
  assert.equal(await repo.updateSubmissionProject("missing", "project_1"), null);
  assert.equal(await repo.updateSubmissionStatus("missing", "semifinalist"), null);
  assert.equal(await repo.updatePlacementVerification("missing", { verificationState: "verified" }), null);
}
);
