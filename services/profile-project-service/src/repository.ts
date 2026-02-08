import { randomUUID } from "node:crypto";
import {
  ensureCoreTables,
  getPool
} from "@script-manifest/db";
import type {
  Project,
  ProjectCoWriter,
  ProjectCoWriterCreateRequest,
  ProjectCreateInternal,
  ProjectDraft,
  ProjectDraftCreateInternal,
  ProjectDraftUpdateRequest,
  ProjectFilters,
  ProjectUpdateRequest,
  WriterProfile,
  WriterProfileUpdateRequest
} from "@script-manifest/contracts";

export interface ProfileProjectRepository {
  init(): Promise<void>;
  userExists(userId: string): Promise<boolean>;
  getProfile(writerId: string): Promise<WriterProfile | null>;
  upsertProfile(writerId: string, update: WriterProfileUpdateRequest): Promise<WriterProfile | null>;
  createProject(input: ProjectCreateInternal): Promise<Project | null>;
  listProjects(filters: ProjectFilters): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  updateProject(projectId: string, update: ProjectUpdateRequest): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;
  listCoWriters(projectId: string): Promise<ProjectCoWriter[]>;
  addCoWriter(projectId: string, input: ProjectCoWriterCreateRequest): Promise<ProjectCoWriter | null>;
  removeCoWriter(projectId: string, coWriterUserId: string): Promise<boolean>;
  listDrafts(projectId: string): Promise<ProjectDraft[]>;
  createDraft(projectId: string, input: ProjectDraftCreateInternal): Promise<ProjectDraft | null>;
  updateDraft(
    projectId: string,
    draftId: string,
    update: ProjectDraftUpdateRequest
  ): Promise<ProjectDraft | null>;
  setPrimaryDraft(projectId: string, draftId: string, ownerUserId: string): Promise<ProjectDraft | null>;
}

export class PgProfileProjectRepository implements ProfileProjectRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
  }

  async userExists(userId: string): Promise<boolean> {
    const db = getPool();
    const user = await db.query<{ id: string }>(
      `SELECT id FROM app_users WHERE id = $1`,
      [userId]
    );
    return Boolean(user.rows[0]);
  }

  async getProfile(writerId: string): Promise<WriterProfile | null> {
    const db = getPool();

    const profile = await db.query<{
      writer_id: string;
      display_name: string;
      bio: string;
      genres: string[];
      representation_status: "represented" | "unrepresented" | "seeking_rep";
    }>(
      `
        SELECT writer_id, display_name, bio, genres, representation_status
        FROM writer_profiles
        WHERE writer_id = $1
      `,
      [writerId]
    );

    const row = profile.rows[0];
    if (row) {
      return {
        id: row.writer_id,
        displayName: row.display_name,
        bio: row.bio,
        genres: row.genres,
        representationStatus: row.representation_status
      };
    }

    const user = await db.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM app_users WHERE id = $1`,
      [writerId]
    );

    const userRow = user.rows[0];
    if (!userRow) {
      return null;
    }

    // Use INSERT ON CONFLICT to handle race conditions
    const inserted = await db.query<{
      writer_id: string;
      display_name: string;
      bio: string;
      genres: string[];
      representation_status: "represented" | "unrepresented" | "seeking_rep";
    }>(
      `
        INSERT INTO writer_profiles (writer_id, display_name)
        VALUES ($1, $2)
        ON CONFLICT (writer_id) DO NOTHING
        RETURNING writer_id, display_name, bio, genres, representation_status
      `,
      [userRow.id, userRow.display_name]
    );

    const insertedRow = inserted.rows[0];
    if (!insertedRow) {
      return null;
    }

    return {
      id: insertedRow.writer_id,
      displayName: insertedRow.display_name,
      bio: insertedRow.bio,
      genres: insertedRow.genres,
      representationStatus: insertedRow.representation_status
    };
  }

  async upsertProfile(
    writerId: string,
    update: WriterProfileUpdateRequest
  ): Promise<WriterProfile | null> {
    const existing = await this.getProfile(writerId);
    if (!existing) {
      return null;
    }

    const nextProfile: WriterProfile = {
      ...existing,
      ...update,
      id: existing.id
    };

    const db = getPool();
    await db.query(
      `
        UPDATE writer_profiles
        SET display_name = $2,
            bio = $3,
            genres = $4,
            representation_status = $5,
            updated_at = NOW()
        WHERE writer_id = $1
      `,
      [
        writerId,
        nextProfile.displayName,
        nextProfile.bio,
        nextProfile.genres,
        nextProfile.representationStatus
      ]
    );

    return nextProfile;
  }

  async createProject(input: ProjectCreateInternal): Promise<Project | null> {
    const db = getPool();
    const owner = await db.query<{ id: string }>(
      `SELECT id FROM app_users WHERE id = $1`,
      [input.ownerUserId]
    );
    if (!owner.rows[0]) {
      return null;
    }

    const id = `project_${randomUUID()}`;
    const created = await db.query<{
      id: string;
      owner_user_id: string;
      title: string;
      logline: string;
      synopsis: string;
      format: string;
      genre: string;
      page_count: number;
      is_discoverable: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        INSERT INTO projects (id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at
      `,
      [
        id,
        input.ownerUserId,
        input.title,
        input.logline,
        input.synopsis,
        input.format,
        input.genre,
        input.pageCount,
        input.isDiscoverable
      ]
    );

    const row = created.rows[0];
    return row ? mapProject(row) : null;
  }

  async listProjects(filters: ProjectFilters): Promise<Project[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.ownerUserId) {
      values.push(filters.ownerUserId);
      conditions.push(`owner_user_id = $${values.length}`);
    }
    if (filters.genre) {
      values.push(filters.genre);
      conditions.push(`genre = $${values.length}`);
    }
    if (filters.format) {
      values.push(filters.format);
      conditions.push(`format = $${values.length}`);
    }

    // Build query with parameterized values only
    let query = `
      SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at
      FROM projects
    `;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY updated_at DESC`;

    // Add pagination
    const limit = filters.limit ?? 30;
    const offset = filters.offset ?? 0;
    values.push(limit);
    query += ` LIMIT $${values.length}`;
    values.push(offset);
    query += ` OFFSET $${values.length}`;

    const result = await db.query<{
      id: string;
      owner_user_id: string;
      title: string;
      logline: string;
      synopsis: string;
      format: string;
      genre: string;
      page_count: number;
      is_discoverable: boolean;
      created_at: string;
      updated_at: string;
    }>(query, values);

    return result.rows.map(mapProject);
  }

  async getProject(projectId: string): Promise<Project | null> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      owner_user_id: string;
      title: string;
      logline: string;
      synopsis: string;
      format: string;
      genre: string;
      page_count: number;
      is_discoverable: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, owner_user_id, title, logline, synopsis, format, genre, page_count, is_discoverable, created_at, updated_at
        FROM projects
        WHERE id = $1
      `,
      [projectId]
    );

    const row = result.rows[0];
    return row ? mapProject(row) : null;
  }

  async updateProject(projectId: string, update: ProjectUpdateRequest): Promise<Project | null> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      return null;
    }

    const next: Project = {
      ...existing,
      ...update,
      id: existing.id,
      ownerUserId: existing.ownerUserId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    const db = getPool();
    await db.query(
      `
        UPDATE projects
        SET title = $2,
            logline = $3,
            synopsis = $4,
            format = $5,
            genre = $6,
            page_count = $7,
            is_discoverable = $8,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        projectId,
        next.title,
        next.logline,
        next.synopsis,
        next.format,
        next.genre,
        next.pageCount,
        next.isDiscoverable
      ]
    );

    return this.getProject(projectId);
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listCoWriters(projectId: string): Promise<ProjectCoWriter[]> {
    const db = getPool();
    const rows = await db.query<{
      project_id: string;
      owner_user_id: string;
      co_writer_user_id: string;
      credit_order: number;
      created_at: string;
    }>(
      `
        SELECT project_id, owner_user_id, co_writer_user_id, credit_order, created_at
        FROM project_co_writers
        WHERE project_id = $1
        ORDER BY credit_order ASC, created_at ASC
      `,
      [projectId]
    );

    return rows.rows.map(mapCoWriter);
  }

  async addCoWriter(
    projectId: string,
    input: ProjectCoWriterCreateRequest
  ): Promise<ProjectCoWriter | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const coWriterExists = await this.userExists(input.coWriterUserId);
    if (!coWriterExists) {
      return null;
    }

    const db = getPool();
    const result = await db.query<{
      project_id: string;
      owner_user_id: string;
      co_writer_user_id: string;
      credit_order: number;
      created_at: string;
    }>(
      `
        INSERT INTO project_co_writers (project_id, owner_user_id, co_writer_user_id, credit_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id, co_writer_user_id)
        DO UPDATE SET credit_order = EXCLUDED.credit_order
        RETURNING project_id, owner_user_id, co_writer_user_id, credit_order, created_at
      `,
      [projectId, project.ownerUserId, input.coWriterUserId, input.creditOrder]
    );

    const row = result.rows[0];
    return row ? mapCoWriter(row) : null;
  }

  async removeCoWriter(projectId: string, coWriterUserId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query(
      `DELETE FROM project_co_writers WHERE project_id = $1 AND co_writer_user_id = $2`,
      [projectId, coWriterUserId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listDrafts(projectId: string): Promise<ProjectDraft[]> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      project_id: string;
      owner_user_id: string;
      script_id: string;
      version_label: string;
      change_summary: string;
      page_count: number;
      lifecycle_state: "active" | "archived";
      is_primary: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count,
               lifecycle_state, is_primary, created_at, updated_at
        FROM project_drafts
        WHERE project_id = $1
        ORDER BY is_primary DESC, updated_at DESC
      `,
      [projectId]
    );

    return result.rows.map(mapDraft);
  }

  async createDraft(projectId: string, input: ProjectDraftCreateInternal): Promise<ProjectDraft | null> {
    const db = getPool();
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const project = await client.query<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM projects WHERE id = $1`,
        [projectId]
      );
      const projectRow = project.rows[0];
      if (!projectRow || projectRow.owner_user_id !== input.ownerUserId) {
        await client.query("ROLLBACK");
        return null;
      }

      const existingPrimary = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM project_drafts
          WHERE project_id = $1 AND is_primary = TRUE
        `,
        [projectId]
      );
      const hasPrimary = Number(existingPrimary.rows[0]?.count ?? "0") > 0;
      const shouldSetPrimary = input.setPrimary || !hasPrimary;

      if (shouldSetPrimary) {
        await client.query(
          `UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1`,
          [projectId]
        );
      }

      const id = `draft_${randomUUID()}`;
      const created = await client.query<{
        id: string;
        project_id: string;
        owner_user_id: string;
        script_id: string;
        version_label: string;
        change_summary: string;
        page_count: number;
        lifecycle_state: "active" | "archived";
        is_primary: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          INSERT INTO project_drafts (
            id, project_id, owner_user_id, script_id, version_label, change_summary, page_count, lifecycle_state, is_primary
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
          RETURNING id, project_id, owner_user_id, script_id, version_label, change_summary, page_count,
                    lifecycle_state, is_primary, created_at, updated_at
        `,
        [
          id,
          projectId,
          input.ownerUserId,
          input.scriptId,
          input.versionLabel,
          input.changeSummary,
          input.pageCount,
          shouldSetPrimary
        ]
      );

      await client.query("COMMIT");
      const row = created.rows[0];
      return row ? mapDraft(row) : null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDraft(
    projectId: string,
    draftId: string,
    update: ProjectDraftUpdateRequest
  ): Promise<ProjectDraft | null> {
    const db = getPool();
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Get existing draft using transaction client
      const existingResult = await client.query<{
        id: string;
        project_id: string;
        owner_user_id: string;
        script_id: string;
        version_label: string;
        change_summary: string;
        page_count: number;
        lifecycle_state: "active" | "archived";
        is_primary: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count,
                 lifecycle_state, is_primary, created_at, updated_at
          FROM project_drafts
          WHERE project_id = $1 AND id = $2
        `,
        [projectId, draftId]
      );

      const existing = existingResult.rows[0];
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }

      const next = {
        ...mapDraft(existing),
        ...update,
        updatedAt: new Date().toISOString()
      };

      await client.query(
        `
          UPDATE project_drafts
          SET version_label = $3,
              change_summary = $4,
              page_count = $5,
              lifecycle_state = $6,
              updated_at = NOW()
          WHERE project_id = $1 AND id = $2
        `,
        [
          projectId,
          draftId,
          next.versionLabel,
          next.changeSummary,
          next.pageCount,
          next.lifecycleState
        ]
      );

      if (next.lifecycleState === "archived" && next.isPrimary) {
        await client.query(
          `UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1 AND id = $2`,
          [projectId, draftId]
        );

        await client.query(
          `
            WITH candidate AS (
              SELECT id
              FROM project_drafts
              WHERE project_id = $1 AND id <> $2 AND lifecycle_state = 'active'
              ORDER BY updated_at DESC
              LIMIT 1
            )
            UPDATE project_drafts
            SET is_primary = TRUE, updated_at = NOW()
            WHERE id IN (SELECT id FROM candidate)
          `,
          [projectId, draftId]
        );
      }

      await client.query("COMMIT");
      
      // After commit, release client and fetch with fresh connection
      client.release();
      return this.getDraft(projectId, draftId);
    } catch (error) {
      await client.query("ROLLBACK");
      client.release();
      throw error;
    }
  }

  async setPrimaryDraft(
    projectId: string,
    draftId: string,
    ownerUserId: string
  ): Promise<ProjectDraft | null> {
    const db = getPool();
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const project = await client.query<{ owner_user_id: string }>(
        `SELECT owner_user_id FROM projects WHERE id = $1`,
        [projectId]
      );
      const projectRow = project.rows[0];
      if (!projectRow || projectRow.owner_user_id !== ownerUserId) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `UPDATE project_drafts SET is_primary = FALSE, updated_at = NOW() WHERE project_id = $1`,
        [projectId]
      );

      const result = await client.query<{
        id: string;
        project_id: string;
        owner_user_id: string;
        script_id: string;
        version_label: string;
        change_summary: string;
        page_count: number;
        lifecycle_state: "active" | "archived";
        is_primary: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `
          UPDATE project_drafts
          SET is_primary = TRUE, updated_at = NOW()
          WHERE project_id = $1 AND id = $2 AND lifecycle_state = 'active'
          RETURNING id, project_id, owner_user_id, script_id, version_label, change_summary, page_count,
                    lifecycle_state, is_primary, created_at, updated_at
        `,
        [projectId, draftId]
      );

      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query("COMMIT");
      return mapDraft(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async getDraft(projectId: string, draftId: string): Promise<ProjectDraft | null> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      project_id: string;
      owner_user_id: string;
      script_id: string;
      version_label: string;
      change_summary: string;
      page_count: number;
      lifecycle_state: "active" | "archived";
      is_primary: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, project_id, owner_user_id, script_id, version_label, change_summary, page_count,
               lifecycle_state, is_primary, created_at, updated_at
        FROM project_drafts
        WHERE project_id = $1 AND id = $2
      `,
      [projectId, draftId]
    );

    const row = result.rows[0];
    return row ? mapDraft(row) : null;
  }
}

function mapProject(row: {
  id: string;
  owner_user_id: string;
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  page_count: number;
  is_discoverable: boolean;
  created_at: string;
  updated_at: string;
}): Project {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    logline: row.logline,
    synopsis: row.synopsis,
    format: row.format,
    genre: row.genre,
    pageCount: row.page_count,
    isDiscoverable: row.is_discoverable,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCoWriter(row: {
  project_id: string;
  owner_user_id: string;
  co_writer_user_id: string;
  credit_order: number;
  created_at: string;
}): ProjectCoWriter {
  return {
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    coWriterUserId: row.co_writer_user_id,
    creditOrder: row.credit_order,
    createdAt: row.created_at
  };
}

function mapDraft(row: {
  id: string;
  project_id: string;
  owner_user_id: string;
  script_id: string;
  version_label: string;
  change_summary: string;
  page_count: number;
  lifecycle_state: "active" | "archived";
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}): ProjectDraft {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    scriptId: row.script_id,
    versionLabel: row.version_label,
    changeSummary: row.change_summary,
    pageCount: row.page_count,
    lifecycleState: row.lifecycle_state,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
