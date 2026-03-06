import { getPool, runMigrations } from "@script-manifest/db";
import type { Competition, CompetitionFilters } from "@script-manifest/contracts";
import type { CompetitionDirectoryRepository } from "./repository.js";

type CompetitionRow = {
  id: string;
  title: string;
  description: string;
  format: string;
  genre: string;
  fee_usd: string | number;
  deadline: Date;
  created_at: Date;
  updated_at: Date;
};

function mapCompetition(row: CompetitionRow): Competition {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    genre: row.genre,
    feeUsd: Number(row.fee_usd),
    deadline: row.deadline.toISOString(),
  };
}

export class PgCompetitionDirectoryRepository implements CompetitionDirectoryRepository {
  async init(): Promise<void> {
    await runMigrations(getPool());
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  async upsertCompetition(competition: Competition): Promise<{ existed: boolean }> {
    const db = getPool();
    const result = await db.query<CompetitionRow & { xmax: string }>(
      `INSERT INTO competitions (id, title, description, format, genre, fee_usd, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           format = EXCLUDED.format,
           genre = EXCLUDED.genre,
           fee_usd = EXCLUDED.fee_usd,
           deadline = EXCLUDED.deadline,
           updated_at = NOW()
       RETURNING *, xmax::text AS xmax`,
      [
        competition.id,
        competition.title,
        competition.description,
        competition.format,
        competition.genre,
        competition.feeUsd,
        competition.deadline,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      return { existed: false };
    }

    return { existed: row.xmax !== "0" };
  }

  async getCompetition(id: string): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `SELECT * FROM competitions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapCompetition(result.rows[0]) : null;
  }

  async listCompetitions(filters: CompetitionFilters): Promise<Competition[]> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.query) {
      values.push(`%${filters.query}%`);
      conditions.push(`(title ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    if (filters.format) {
      values.push(filters.format);
      conditions.push(`LOWER(format) = LOWER($${values.length})`);
    }

    if (filters.genre) {
      values.push(filters.genre);
      conditions.push(`LOWER(genre) = LOWER($${values.length})`);
    }

    if (typeof filters.maxFeeUsd === "number") {
      values.push(filters.maxFeeUsd);
      conditions.push(`fee_usd <= $${values.length}`);
    }

    if (filters.deadlineBefore) {
      values.push(filters.deadlineBefore.toISOString());
      conditions.push(`deadline < $${values.length}`);
    }

    let query = "SELECT * FROM competitions";
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY created_at DESC";

    const result = await db.query<CompetitionRow>(query, values);
    return result.rows.map(mapCompetition);
  }

  async getAllCompetitions(): Promise<Competition[]> {
    const db = getPool();
    const result = await db.query<CompetitionRow>("SELECT * FROM competitions ORDER BY created_at");
    return result.rows.map(mapCompetition);
  }
}
