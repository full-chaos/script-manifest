import assert from "node:assert/strict";
import test, { mock } from "node:test";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;

let queryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
const query: QueryFn = async (sql, values = []) => queryImpl(sql, values);

mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => ({ query }),
    ensureCoreTables: async () => undefined,
    ensureProgramsTables: async () => undefined
  }
});

const { PgProgramsRepository } = await import("./repository.js");

test("PgProgramsRepository listPrograms builds status-filtered query", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return {
      rows: [
        {
          id: "program_1",
          slug: "summer-lab",
          title: "Summer Lab",
          description: "",
          status: "open",
          application_opens_at: "2026-01-01T00:00:00.000Z",
          application_closes_at: "2026-02-01T00:00:00.000Z",
          created_by_user_id: "admin_1",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z"
        }
      ]
    };
  };

  const repo = new PgProgramsRepository();
  const programs = await repo.listPrograms("open");

  assert.equal(programs.length, 1);
  assert.equal(programs[0]?.id, "program_1");
  assert.equal(programs[0]?.slug, "summer-lab");
  assert.equal(programs[0]?.status, "open");
  assert.match(capturedSql, /FROM programs/);
  assert.match(capturedSql, /WHERE status = \$1/);
  assert.match(capturedSql, /ORDER BY application_closes_at ASC/);
  assert.deepEqual(capturedValues, ["open"]);
});

test("PgProgramsRepository getProgramApplicationForm returns default form when missing", async () => {
  let capturedValues: unknown[] = [];

  queryImpl = async (_sql, values = []) => {
    capturedValues = values;
    return { rows: [], rowCount: 0 };
  };

  const repo = new PgProgramsRepository();
  const form = await repo.getProgramApplicationForm("program_1");

  assert.deepEqual(form, {
    fields: [],
    updatedByUserId: "",
    updatedAt: new Date(0).toISOString()
  });
  assert.deepEqual(capturedValues, ["program_1"]);
});

test("PgProgramsRepository listUserProgramApplications filters by program and user", async () => {
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  queryImpl = async (sql, values = []) => {
    capturedSql = sql;
    capturedValues = values;
    return {
      rows: [
        {
          id: "application_1",
          program_id: "program_1",
          user_id: "writer_1",
          statement: "I want in",
          sample_project_id: null,
          status: "submitted",
          score: null,
          decision_notes: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: "2026-01-03T00:00:00.000Z",
          updated_at: "2026-01-04T00:00:00.000Z"
        }
      ]
    };
  };

  const repo = new PgProgramsRepository();
  const applications = await repo.listUserProgramApplications("program_1", "writer_1");

  assert.equal(applications.length, 1);
  assert.equal(applications[0]?.id, "application_1");
  assert.equal(applications[0]?.programId, "program_1");
  assert.equal(applications[0]?.userId, "writer_1");
  assert.match(capturedSql, /FROM program_applications/);
  assert.match(capturedSql, /program_id = \$1/);
  assert.match(capturedSql, /user_id = \$2/);
  assert.match(capturedSql, /ORDER BY updated_at DESC/);
  assert.deepEqual(capturedValues, ["program_1", "writer_1"]);
});
