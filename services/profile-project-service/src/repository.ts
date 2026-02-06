import { randomUUID } from "node:crypto";
import {
  ensureCoreTables,
  getPool
} from "@script-manifest/db";
import type { Project, ProjectCreateRequest, ProjectFilters, ProjectUpdateRequest, WriterProfile, WriterProfileUpdateRequest } from "@script-manifest/contracts";

export interface ProfileProjectRepository {
  init(): Promise<void>;
  getProfile(writerId: string): Promise<WriterProfile | null>;
  upsertProfile(writerId: string, update: WriterProfileUpdateRequest): Promise<WriterProfile | null>;
  createProject(input: ProjectCreateRequest): Promise<Project | null>;
  listProjects(filters: ProjectFilters): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  updateProject(projectId: string, update: ProjectUpdateRequest): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;
}

export class PgProfileProjectRepository implements ProfileProjectRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
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

  async createProject(input: ProjectCreateRequest): Promise<Project | null> {
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
