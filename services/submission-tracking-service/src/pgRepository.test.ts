import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

await mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    runMigrations: async () => undefined
  }
});

const { PgSubmissionTrackingRepository } = await import("./pgRepository.js");

test("PgSubmissionTrackingRepository createSubmission maps Date fields", async () => {
  const createdAt = new Date("2026-03-01T00:00:00.000Z");
  const updatedAt = new Date("2026-03-02T00:00:00.000Z");

  queryImpl = async () => ({
    rows: [
      {
        id: "submission_1",
        writer_id: "writer_1",
        project_id: "project_1",
        competition_id: "comp_1",
        status: "submitted",
        created_at: createdAt,
        updated_at: updatedAt
      }
    ]
  });

  const repo = new PgSubmissionTrackingRepository();
  const submission = await repo.createSubmission({
    writerId: "writer_1",
    projectId: "project_1",
    competitionId: "comp_1",
    status: "pending"
  });

  assert.equal(submission.id, "submission_1");
  assert.equal(submission.createdAt, createdAt.toISOString());
  assert.equal(submission.updatedAt, updatedAt.toISOString());
});

test("PgSubmissionTrackingRepository listSubmissions builds query from filters", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return { rows: [] };
  };

  const repo = new PgSubmissionTrackingRepository();
  const rows = await repo.listSubmissions({
    writerId: "writer_1",
    projectId: "project_1",
    competitionId: "comp_1",
    status: "pending"
  });

  assert.deepEqual(rows, []);
  assert.match(capturedSql, /writer_id = \$1/);
  assert.match(capturedSql, /project_id = \$2/);
  assert.match(capturedSql, /competition_id = \$3/);
  assert.match(capturedSql, /status = \$4/);
  assert.deepEqual(capturedValues, ["writer_1", "project_1", "comp_1", "pending"]);
});
