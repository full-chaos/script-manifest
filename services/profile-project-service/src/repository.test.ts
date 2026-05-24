import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import type {
  Project,
  ProjectCoWriterCreateRequest,
  ProjectCreateInternal,
  ProjectDraft,
  ProjectDraftCreateInternal,
  ProjectDraftUpdateRequest,
  ProjectFilters,
  ProjectUpdateRequest,
  ScriptAccessRequestCreateRequest,
  ScriptAccessRequestFilters,
  WriterProfileUpdateRequest
} from "@script-manifest/contracts";

type QueryResult = { rows: unknown[]; rowCount?: number };
type QueryFn = (sql: string, values?: unknown[]) => Promise<QueryResult>;
type Client = { query: QueryFn; release: () => void };

const publishCalls: unknown[] = [];
const poolCalls: Array<{ sql: string; values: unknown[] }> = [];
const clientCalls: Array<{ sql: string; values: unknown[] }> = [];

let poolQueryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
let clientQueryImpl: QueryFn = async () => ({ rows: [], rowCount: 0 });
let releaseCount = 0;

const pool = {
  query: async (sql: string, values: unknown[] = []) => {
    poolCalls.push({ sql, values });
    return poolQueryImpl(sql, values);
  },
  connect: async (): Promise<Client> => ({
    query: async (sql: string, values: unknown[] = []) => {
      clientCalls.push({ sql, values });
      return clientQueryImpl(sql, values);
    },
    release: () => {
      releaseCount += 1;
    }
  })
};

mock.module("@script-manifest/db", {
  namedExports: {
    getPool: () => pool,
    ensureCoreTables: async () => undefined
  }
});

mock.module("@script-manifest/service-utils", {
  namedExports: {
    publishSearchSyncEvent: async (event: unknown) => {
      publishCalls.push(event);
    }
  }
});

const { PgProfileProjectRepository } = await import("./repository.js");

beforeEach(() => {
  publishCalls.length = 0;
  poolCalls.length = 0;
  clientCalls.length = 0;
  releaseCount = 0;
  poolQueryImpl = async () => ({ rows: [], rowCount: 0 });
  clientQueryImpl = async () => ({ rows: [], rowCount: 0 });
});

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function projectRow(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    ownerUserId: "writer_01",
    title: "Project Title",
    logline: "A logline",
    synopsis: "A synopsis",
    format: "feature",
    genre: "Drama",
    pageCount: 110,
    isDiscoverable: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

function draftRow(overrides: Partial<ProjectDraft> = {}): ProjectDraft {
  return {
    id: "draft_1",
    projectId: "project_1",
    ownerUserId: "writer_01",
    scriptId: "script_1",
    versionLabel: "v1",
    changeSummary: "Initial draft",
    pageCount: 100,
    lifecycleState: "active",
    isPrimary: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

test("PgProfileProjectRepository healthCheck reports database status", async () => {
  const repo = new PgProfileProjectRepository();

  poolQueryImpl = async () => ({ rows: [] });
  assert.deepEqual(await repo.healthCheck(), { database: true });

  poolQueryImpl = async () => {
    throw new Error("db down");
  };
  assert.deepEqual(await repo.healthCheck(), { database: false });
});

test("PgProfileProjectRepository userExists and getProfile map profile rows", async () => {
  const repo = new PgProfileProjectRepository();

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized === "SELECT id FROM app_users WHERE id = $1") {
      assert.deepEqual(values, ["writer_01"]);
      return { rows: [{ id: "writer_01" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT writer_id, display_name, bio, genres, demographics, representation_status, headshot_url, custom_profile_url, is_searchable FROM writer_profiles WHERE writer_id = $1")) {
      assert.deepEqual(values, ["writer_01"]);
      return { rows: [] };
    }
    if (normalized === "SELECT id, display_name FROM app_users WHERE id = $1") {
      assert.deepEqual(values, ["writer_01"]);
      return { rows: [{ id: "writer_01", display_name: "Writer One" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO writer_profiles (writer_id, display_name)")) {
      assert.deepEqual(values, ["writer_01", "Writer One"]);
      return {
        rows: [
          {
            writer_id: "writer_01",
            display_name: "Writer One",
            bio: "",
            genres: ["Drama"],
            demographics: ["Latinx"],
            representation_status: "unrepresented",
            headshot_url: "https://cdn.example.com/writer_01.jpg",
            custom_profile_url: "https://profiles.example.com/writer-one",
            is_searchable: true,
            resume_public: true
          }
        ],
        rowCount: 1
      };
    }
    return { rows: [] };
  };

  assert.equal(await repo.userExists("writer_01"), true);

  const profile = await repo.getProfile("writer_01");

  assert.deepEqual(profile, {
    id: "writer_01",
    displayName: "Writer One",
    bio: "",
    genres: ["Drama"],
    demographics: ["Latinx"],
    representationStatus: "unrepresented",
    headshotUrl: "https://cdn.example.com/writer_01.jpg",
    customProfileUrl: "https://profiles.example.com/writer-one",
    isSearchable: true,
    resumePublic: true
  });
});

test("PgProfileProjectRepository upsertProfile updates profile fields and publishes sync event", async () => {
  const repo = new PgProfileProjectRepository();

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("UPDATE writer_profiles")) {
      assert.deepEqual(values, [
        "writer_01",
        "Writer One",
        "Updated bio",
        ["Drama", "Thriller"],
        null,
        "represented",
        null,
        "https://profiles.example.com/writer-one",
        false,
        false
      ]);
      return {
        rows: [
          {
            writer_id: "writer_01",
            display_name: "Writer One",
            bio: "Updated bio",
            genres: ["Drama", "Thriller"],
            demographics: [],
            representation_status: "represented",
            headshot_url: "https://cdn.example.com/writer_01.jpg",
            custom_profile_url: "https://profiles.example.com/writer-one",
            is_searchable: false,
            resume_public: false
          }
        ]
      };
    }
    return { rows: [] };
  };

  const profile = await repo.upsertProfile("writer_01", {
    displayName: "Writer One",
    bio: "Updated bio",
    genres: ["Drama", "Thriller"],
    representationStatus: "represented",
    customProfileUrl: "https://profiles.example.com/writer-one",
    isSearchable: false,
    resumePublic: false
  } satisfies WriterProfileUpdateRequest);

  assert.deepEqual(profile, {
    id: "writer_01",
    displayName: "Writer One",
    bio: "Updated bio",
    genres: ["Drama", "Thriller"],
    demographics: [],
    representationStatus: "represented",
    headshotUrl: "https://cdn.example.com/writer_01.jpg",
    customProfileUrl: "https://profiles.example.com/writer-one",
    isSearchable: false,
    resumePublic: false
  });
  assert.equal(publishCalls.length, 1);
  assert.deepEqual(publishCalls[0], {
    collection: "talent",
    documentId: "profile_writer_01",
    operation: "upsert",
    payload: {
      type: "profile_update",
      writerId: "writer_01",
      displayName: "Writer One",
      representationStatus: "represented",
      genres: ["Drama", "Thriller"],
      demographics: [],
      isSearchable: false
    }
  });
});

test("PgProfileProjectRepository creates, lists, gets, updates, and deletes projects", async () => {
  const repo = new PgProfileProjectRepository();
  const created = projectRow({ id: "project_created", updatedAt: "2026-01-03T00:00:00.000Z" });
  const updated = projectRow({ title: "Updated Title", updatedAt: "2026-01-04T00:00:00.000Z" });
  let selectCount = 0;

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("SELECT id FROM app_users WHERE id = $1")) {
      assert.deepEqual(values, ["writer_01"]);
      return { rows: [{ id: "writer_01" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO projects (id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable)")) {
      assert.match(String(values[0]), /^project_/);
      assert.deepEqual(values.slice(1), [
        "writer_01",
        "Project Title",
        "A logline",
        "A synopsis",
        "feature",
        "Drama",
        110,
        true
      ]);
      return {
        rows: [
          {
            id: created.id,
            owner_user_id: created.ownerUserId,
            title: created.title,
            logline: created.logline,
            synopsis: created.synopsis,
            format: created.format,
            genre: created.genre,
            page_count: created.pageCount,
            is_discoverable: created.isDiscoverable,
            created_at: created.createdAt,
            updated_at: created.updatedAt
          }
        ],
        rowCount: 1
      };
    }
    if (normalized.startsWith("SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at FROM projects WHERE owner_user_id = $1 AND genre = $2 AND format = $3 ORDER BY updated_at DESC LIMIT $4 OFFSET $5")) {
      assert.deepEqual(values, ["writer_01", "Drama", "feature", 10, 5]);
      return {
        rows: [
          {
            id: created.id,
            owner_user_id: created.ownerUserId,
            title: created.title,
            logline: created.logline,
            synopsis: created.synopsis,
            format: created.format,
            genre: created.genre,
            page_count: created.pageCount,
            is_discoverable: created.isDiscoverable,
            created_at: created.createdAt,
            updated_at: created.updatedAt
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at FROM projects WHERE id = $1")) {
      selectCount += 1;
      assert.deepEqual(values, ["project_created"]);
      return {
        rows: [
          {
            id: selectCount === 1 ? created.id : updated.id,
            owner_user_id: created.ownerUserId,
            title: selectCount === 1 ? created.title : updated.title,
            logline: created.logline,
            synopsis: created.synopsis,
            format: created.format,
            genre: created.genre,
            page_count: created.pageCount,
            is_discoverable: created.isDiscoverable,
            created_at: created.createdAt,
            updated_at: selectCount === 1 ? created.updatedAt : updated.updatedAt
          }
        ]
      };
    }
    if (normalized.startsWith("UPDATE projects SET title = $2, logline = $3, synopsis = $4, format = $5, genre = $6, page_count = $7, is_discoverable = $8, updated_at = NOW() WHERE id = $1")) {
      assert.deepEqual(values, [
        "project_created",
        "Updated Title",
        "A logline",
        "A synopsis",
        "feature",
        "Drama",
        110,
        true
      ]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("DELETE FROM projects WHERE id = $1")) {
      assert.deepEqual(values, ["project_created"]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  };

  const createdProject = await repo.createProject({
    ownerUserId: "writer_01",
    title: "Project Title",
    logline: "A logline",
    synopsis: "A synopsis",
    format: "feature",
    genre: "Drama",
    pageCount: 110,
    isDiscoverable: true
  } satisfies ProjectCreateInternal);

  assert.ok(createdProject);
  assert.match(createdProject.id, /^project_/);
  assert.equal(publishCalls.length, 1);

  const projects = await repo.listProjects({
    ownerUserId: "writer_01",
    genre: "Drama",
    format: "feature",
    limit: 10,
    offset: 5
  } satisfies ProjectFilters);

  assert.deepEqual(projects, [created]);

  const fetched = await repo.getProject("project_created");
  assert.deepEqual(fetched, created);
});

test("PgProfileProjectRepository updates and deletes projects with search sync events", async () => {
  const repo = new PgProfileProjectRepository();
  const existing = projectRow({ id: "project_2", title: "Original Title", updatedAt: "2026-01-03T00:00:00.000Z" });
  const updated = projectRow({
    id: "project_2",
    title: "Updated Title",
    logline: "Updated logline",
    synopsis: "Updated synopsis",
    genre: "Thriller",
    pageCount: 120,
    isDiscoverable: false,
    updatedAt: "2026-01-04T00:00:00.000Z"
  });
  let getCount = 0;

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at FROM projects WHERE id = $1")) {
      getCount += 1;
      assert.deepEqual(values, ["project_2"]);
      return {
        rows: [getCount === 1 ? {
          id: existing.id,
          owner_user_id: existing.ownerUserId,
          title: existing.title,
          logline: existing.logline,
          synopsis: existing.synopsis,
          format: existing.format,
          genre: existing.genre,
          page_count: existing.pageCount,
          is_discoverable: existing.isDiscoverable,
          created_at: existing.createdAt,
          updated_at: existing.updatedAt
        } : {
          id: updated.id,
          owner_user_id: updated.ownerUserId,
          title: updated.title,
          logline: updated.logline,
          synopsis: updated.synopsis,
          format: updated.format,
          genre: updated.genre,
          page_count: updated.pageCount,
          is_discoverable: updated.isDiscoverable,
          created_at: updated.createdAt,
          updated_at: updated.updatedAt
        }]
      };
    }
    if (normalized.startsWith("UPDATE projects SET title = $2, logline = $3, synopsis = $4, format = $5, genre = $6, page_count = $7, is_discoverable = $8, updated_at = NOW() WHERE id = $1")) {
      assert.deepEqual(values, [
        "project_2",
        "Updated Title",
        "Updated logline",
        "Updated synopsis",
        "feature",
        "Thriller",
        120,
        false
      ]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("DELETE FROM projects WHERE id = $1")) {
      assert.deepEqual(values, ["project_2"]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  };

  const next = await repo.updateProject("project_2", {
    title: "Updated Title",
    logline: "Updated logline",
    synopsis: "Updated synopsis",
    format: "feature",
    genre: "Thriller",
    pageCount: 120,
    isDiscoverable: false
  } satisfies ProjectUpdateRequest);

  assert.deepEqual(next, updated);
  assert.equal(publishCalls.length, 1);
  assert.deepEqual(publishCalls[0], {
    collection: "projects",
    documentId: "project_2",
    operation: "upsert",
    payload: {
      id: "project_2",
      ownerUserId: "writer_01",
      title: "Updated Title",
      logline: "Updated logline",
      synopsis: "Updated synopsis",
      format: "feature",
      genre: "Thriller",
      pageCount: 120,
      isDiscoverable: false,
      updatedAt: "2026-01-04T00:00:00.000Z"
    }
  });

  const deleted = await repo.deleteProject("project_2");
  assert.equal(deleted, true);
  assert.equal(publishCalls.length, 2);
  assert.deepEqual(publishCalls[1], {
    collection: "projects",
    documentId: "project_2",
    operation: "delete",
    payload: null
  });
});

test("PgProfileProjectRepository manages co-writers", async () => {
  const repo = new PgProfileProjectRepository();

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("SELECT project_id, owner_user_id, co_writer_user_id, credit_order, created_at FROM project_co_writers WHERE project_id = $1 ORDER BY credit_order ASC, created_at ASC")) {
      assert.deepEqual(values, ["project_1"]);
      return {
        rows: [
          {
            project_id: "project_1",
            owner_user_id: "writer_01",
            co_writer_user_id: "writer_03",
            credit_order: 2,
            created_at: "2026-01-02T00:00:00.000Z"
          },
          {
            project_id: "project_1",
            owner_user_id: "writer_01",
            co_writer_user_id: "writer_02",
            credit_order: 1,
            created_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at FROM projects WHERE id = $1")) {
      return {
        rows: [
          {
            id: "project_1",
            owner_user_id: "writer_01",
            title: "Project Title",
            logline: "A logline",
            synopsis: "A synopsis",
            format: "feature",
            genre: "Drama",
            page_count: 110,
            is_discoverable: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id FROM app_users WHERE id = $1")) {
      return { rows: [{ id: "writer_02" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO project_co_writers")) {
      assert.deepEqual(values, ["project_1", "writer_01", "writer_02", 1]);
      return {
        rows: [
          {
            project_id: "project_1",
            owner_user_id: "writer_01",
            co_writer_user_id: "writer_02",
            credit_order: 1,
            created_at: "2026-01-03T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("DELETE FROM project_co_writers WHERE project_id = $1 AND co_writer_user_id = $2")) {
      assert.deepEqual(values, ["project_1", "writer_02"]);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  };

  const coWriters = await repo.listCoWriters("project_1");
  assert.deepEqual(coWriters, [
    {
      projectId: "project_1",
      ownerUserId: "writer_01",
      coWriterUserId: "writer_03",
      creditOrder: 2,
      createdAt: "2026-01-02T00:00:00.000Z"
    },
    {
      projectId: "project_1",
      ownerUserId: "writer_01",
      coWriterUserId: "writer_02",
      creditOrder: 1,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ]);

  const added = await repo.addCoWriter("project_1", {
    coWriterUserId: "writer_02",
    creditOrder: 1
  } satisfies ProjectCoWriterCreateRequest);

  assert.deepEqual(added, {
    projectId: "project_1",
    ownerUserId: "writer_01",
    coWriterUserId: "writer_02",
    creditOrder: 1,
    createdAt: "2026-01-03T00:00:00.000Z"
  });

  const removed = await repo.removeCoWriter("project_1", "writer_02");
  assert.equal(removed, true);
});

test("PgProfileProjectRepository creates, updates, and promotes drafts", async () => {
  const repo = new PgProfileProjectRepository();
  let draftUpdated = false;

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count, lifecycle_state, is_primary, created_at, updated_at FROM project_drafts WHERE project_id = $1 ORDER BY is_primary DESC, updated_at DESC")) {
      return {
        rows: [
          {
            id: "draft_2",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_2",
            version_label: "v2",
            change_summary: "Second draft",
            page_count: 102,
            lifecycle_state: "active",
            is_primary: true,
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: "2026-01-03T00:00:00.000Z"
          },
          {
            id: "draft_1",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_1",
            version_label: "v1",
            change_summary: "First draft",
            page_count: 100,
            lifecycle_state: "active",
            is_primary: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT owner_user_id FROM projects WHERE id = $1")) {
      assert.deepEqual(values, ["project_1"]);
      return { rows: [{ owner_user_id: "writer_01" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT COUNT(*)::text AS count FROM project_drafts WHERE project_id = $1 AND is_primary = TRUE")) {
      assert.deepEqual(values, ["project_1"]);
      return { rows: [{ count: "1" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO project_drafts (")) {
      assert.match(String(values[0]), /^draft_/);
      assert.deepEqual(values.slice(1), [
        "project_1",
        "writer_01",
        "script_new",
        "v3",
        "Third draft",
        103,
        false
      ]);
      return {
        rows: [
          {
            id: "draft_new",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_new",
            version_label: "v3",
            change_summary: "Third draft",
            page_count: 103,
            lifecycle_state: "active",
            is_primary: false,
            created_at: "2026-01-04T00:00:00.000Z",
            updated_at: "2026-01-04T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count, lifecycle_state, is_primary, created_at, updated_at FROM project_drafts WHERE project_id = $1 AND id = $2")) {
      assert.deepEqual(values, ["project_1", "draft_1"]);
      if (!draftUpdated) {
        return {
          rows: [
            {
              id: "draft_1",
              project_id: "project_1",
              owner_user_id: "writer_01",
              script_id: "script_1",
              version_label: "v1",
              change_summary: "First draft",
              page_count: 100,
              lifecycle_state: "active",
              is_primary: false,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z"
            }
          ]
        };
      }
      return {
        rows: [
          {
            id: "draft_1",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_1",
            version_label: "v1.1",
            change_summary: "Updated summary",
            page_count: 101,
            lifecycle_state: "active",
            is_primary: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-05T00:00:00.000Z"
          }
        ]
      };
    }
    return { rows: [] };
  };

  clientQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return { rows: [] };
    }
    if (normalized.startsWith("SELECT owner_user_id FROM projects WHERE id = $1")) {
      return { rows: [{ owner_user_id: "writer_01" }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT COUNT(*)::text AS count FROM project_drafts WHERE project_id = $1 AND is_primary = TRUE")) {
      return { rows: [{ count: "1" }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO project_drafts (")) {
      assert.match(String(values[0]), /^draft_/);
      assert.deepEqual(values.slice(1), [
        "project_1",
        "writer_01",
        "script_new",
        "v3",
        "Third draft",
        103,
        false
      ]);
      return {
        rows: [
          {
            id: "draft_new",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_new",
            version_label: "v3",
            change_summary: "Third draft",
            page_count: 103,
            lifecycle_state: "active",
            is_primary: false,
            created_at: "2026-01-04T00:00:00.000Z",
            updated_at: "2026-01-04T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count, lifecycle_state, is_primary, created_at, updated_at FROM project_drafts WHERE project_id = $1 AND id = $2")) {
      return {
        rows: [
          {
            id: "draft_1",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_1",
            version_label: "v1",
            change_summary: "First draft",
            page_count: 100,
            lifecycle_state: "active",
            is_primary: false,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("UPDATE project_drafts SET version_label = $3, change_summary = $4, page_count = $5, lifecycle_state = $6, updated_at = NOW() WHERE project_id = $1 AND id = $2")) {
      assert.deepEqual(values, ["project_1", "draft_1", "v1.1", "Updated summary", 101, "active"]);
      draftUpdated = true;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1")) {
      assert.deepEqual(values, ["project_1"]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1 AND id = $2")) {
      assert.deepEqual(values, ["project_1", "draft_2"]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("WITH candidate AS (")) {
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE project_drafts SET is_primary = TRUE, updated_at = NOW() WHERE project_id = $1 AND id = $2 AND lifecycle_state = 'active' RETURNING id, project_id, owner_user_id, script_id, version_label, change_summary, page_count, lifecycle_state, is_primary, created_at, updated_at")) {
      assert.deepEqual(values, ["project_1", "draft_2"]);
      return {
        rows: [
          {
            id: "draft_2",
            project_id: "project_1",
            owner_user_id: "writer_01",
            script_id: "script_2",
            version_label: "v2",
            change_summary: "Second draft",
            page_count: 102,
            lifecycle_state: "active",
            is_primary: true,
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: "2026-01-06T00:00:00.000Z"
          }
        ]
      };
    }
    return { rows: [] };
  };

  const drafts = await repo.listDrafts("project_1");
  assert.deepEqual(drafts, [
    draftRow({ id: "draft_2", scriptId: "script_2", versionLabel: "v2", changeSummary: "Second draft", pageCount: 102, isPrimary: true, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" }),
    draftRow({ id: "draft_1", versionLabel: "v1", changeSummary: "First draft", pageCount: 100, isPrimary: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" })
  ]);

  const createdDraft = await repo.createDraft("project_1", {
    ownerUserId: "writer_01",
    scriptId: "script_new",
    versionLabel: "v3",
    changeSummary: "Third draft",
    pageCount: 103,
    setPrimary: false
  } satisfies ProjectDraftCreateInternal);

  assert.match(String(createdDraft?.id), /^draft_/);
  assert.deepEqual(createdDraft, {
    id: "draft_new",
    projectId: "project_1",
    ownerUserId: "writer_01",
    scriptId: "script_new",
    versionLabel: "v3",
    changeSummary: "Third draft",
    pageCount: 103,
    lifecycleState: "active",
    isPrimary: false,
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z"
  });

  const updatedDraft = await repo.updateDraft("project_1", "draft_1", {
    versionLabel: "v1.1",
    changeSummary: "Updated summary",
    pageCount: 101,
    lifecycleState: "active"
  } satisfies ProjectDraftUpdateRequest);

  assert.deepEqual(updatedDraft, {
    id: "draft_1",
    projectId: "project_1",
    ownerUserId: "writer_01",
    scriptId: "script_1",
    versionLabel: "v1.1",
    changeSummary: "Updated summary",
    pageCount: 101,
    lifecycleState: "active",
    isPrimary: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z"
  });

  const promoted = await repo.setPrimaryDraft("project_1", "draft_2", "writer_01");
  assert.deepEqual(promoted, {
    id: "draft_2",
    projectId: "project_1",
    ownerUserId: "writer_01",
    scriptId: "script_2",
    versionLabel: "v2",
    changeSummary: "Second draft",
    pageCount: 102,
    lifecycleState: "active",
    isPrimary: true,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-06T00:00:00.000Z"
  });
  assert.equal(releaseCount, 3);
});

test("PgProfileProjectRepository creates, lists, and decides access requests", async () => {
  const repo = new PgProfileProjectRepository();
  let listCount = 0;

  poolQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized.startsWith("INSERT INTO script_access_requests (")) {
      assert.match(String(values[0]), /^access_/);
      assert.deepEqual(values.slice(1), ["script_1", "writer_02", "writer_01", "Need access"]);
      return {
        rows: [
          {
            id: "access_1",
            script_id: "script_1",
            requester_user_id: "writer_02",
            owner_user_id: "writer_01",
            status: "pending",
            reason: "Need access",
            decision_reason: null,
            decided_by_user_id: null,
            requested_at: "2026-01-01T00:00:00.000Z",
            decided_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("SELECT id, script_id, requester_user_id, owner_user_id, status, reason, decision_reason, decided_by_user_id, requested_at, decided_at, created_at, updated_at FROM script_access_requests WHERE script_id = $1 AND requester_user_id = $2 AND owner_user_id = $3 AND status = $4 ORDER BY updated_at DESC, created_at DESC")) {
      assert.deepEqual(values, ["script_1", "writer_02", "writer_01", "pending"]);
      listCount += 1;
      return {
        rows: [
          {
            id: "access_1",
            script_id: "script_1",
            requester_user_id: "writer_02",
            owner_user_id: "writer_01",
            status: listCount === 1 ? "pending" : "approved",
            reason: "Need access",
            decision_reason: listCount === 1 ? null : "Approved",
            decided_by_user_id: listCount === 1 ? null : "writer_01",
            requested_at: "2026-01-01T00:00:00.000Z",
            decided_at: listCount === 1 ? null : "2026-01-02T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: listCount === 1 ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z"
          }
        ]
      };
    }
    if (normalized.startsWith("UPDATE script_access_requests SET status = $4, decision_reason = $5, decided_by_user_id = $6, decided_at = NOW(), updated_at = NOW() WHERE id = $1 AND script_id = $2 AND owner_user_id = $3 AND status = 'pending' RETURNING id, script_id, requester_user_id, owner_user_id, status, reason, decision_reason, decided_by_user_id, requested_at, decided_at, created_at, updated_at")) {
      assert.deepEqual(values, ["access_1", "script_1", "writer_01", "approved", "Approved", "writer_01"]);
      return {
        rows: [
          {
            id: "access_1",
            script_id: "script_1",
            requester_user_id: "writer_02",
            owner_user_id: "writer_01",
            status: "approved",
            reason: "Need access",
            decision_reason: "Approved",
            decided_by_user_id: "writer_01",
            requested_at: "2026-01-01T00:00:00.000Z",
            decided_at: "2026-01-02T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z"
          }
        ]
      };
    }
    return { rows: [] };
  };

  clientQueryImpl = async (sql, values = []) => {
    const normalized = normalizeSql(sql);
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return { rows: [] };
    }
    if (normalized.startsWith("UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1")) {
      assert.deepEqual(values, ["project_1"]);
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("UPDATE script_access_requests SET status = $4, decision_reason = $5, decided_by_user_id = $6, decided_at = NOW(), updated_at = NOW() WHERE id = $1 AND script_id = $2 AND owner_user_id = $3 AND status = 'pending' RETURNING id, script_id, requester_user_id, owner_user_id, status, reason, decision_reason, decided_by_user_id, requested_at, decided_at, created_at, updated_at")) {
      assert.deepEqual(values, ["access_1", "script_1", "writer_01", "approved", "Approved", "writer_01"]);
      return {
        rows: [
          {
            id: "access_1",
            script_id: "script_1",
            requester_user_id: "writer_02",
            owner_user_id: "writer_01",
            status: "approved",
            reason: "Need access",
            decision_reason: "Approved",
            decided_by_user_id: "writer_01",
            requested_at: "2026-01-01T00:00:00.000Z",
            decided_at: "2026-01-02T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z"
          }
        ]
      };
    }
    return { rows: [] };
  };

  const created = await repo.createScriptAccessRequest("script_1", {
    requesterUserId: "writer_02",
    ownerUserId: "writer_01",
    reason: "Need access"
  } satisfies ScriptAccessRequestCreateRequest);

  assert.ok(created);
  assert.match(created.id, /^access_/);

  const requests = await repo.listScriptAccessRequests("script_1", {
    requesterUserId: "writer_02",
    ownerUserId: "writer_01",
    status: "pending"
  } satisfies ScriptAccessRequestFilters);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.status, "pending");

  const decided = await repo.decideScriptAccessRequest(
    "script_1",
    "access_1",
    "writer_01",
    "approved",
    "Approved"
  );

  assert.deepEqual(decided, {
    id: "access_1",
    scriptId: "script_1",
    requesterUserId: "writer_02",
    ownerUserId: "writer_01",
    status: "approved",
    reason: "Need access",
    decisionReason: "Approved",
    decidedByUserId: "writer_01",
    requestedAt: "2026-01-01T00:00:00.000Z",
    decidedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  });
});
