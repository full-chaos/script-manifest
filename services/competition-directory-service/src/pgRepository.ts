import { getPool, runMigrations, toFtsPrefixQuery } from "@script-manifest/db";
import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility } from "@script-manifest/contracts";
import type { CompetitionDirectoryRepository } from "./repository.js";

type CompetitionRow = {
  id: string;
  title: string;
  description: string;
  format: string;
  genre: string;
  fee_usd: string | number;
  deadline: Date;
  status: string;
  visibility: string;
  access_type: string;
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
    status: row.status as Competition["status"],
    visibility: row.visibility as Competition["visibility"],
    accessType: row.access_type as Competition["accessType"]
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

    if (!filters.includeCancelled) {
      conditions.push(`status = 'active'`);
    }

    if (!filters.includeHidden) {
      conditions.push(`visibility = 'listed'`);
    }

    let orderBy = "ORDER BY created_at DESC";

    if (filters.query) {
      const prefixQuery = toFtsPrefixQuery(filters.query);
      if (prefixQuery) {
        values.push(prefixQuery);
        const idx = values.length;
        conditions.push(`search_vector @@ to_tsquery('english', $${idx})`);
        orderBy = `ORDER BY ts_rank_cd(search_vector, to_tsquery('english', $${idx})) DESC, created_at DESC`;
      }
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
    query += ` ${orderBy}`;

    const result = await db.query<CompetitionRow>(query, values);
    return result.rows.map(mapCompetition);
  }

  async getAllCompetitions(): Promise<Competition[]> {
    const db = getPool();
    const result = await db.query<CompetitionRow>("SELECT * FROM competitions ORDER BY created_at");
    return result.rows.map(mapCompetition);
  }

  async cancelCompetition(id: string): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id]
    );
    return result.rows[0] ? mapCompetition(result.rows[0]) : null;
  }

  async updateVisibility(id: string, visibility: CompetitionVisibility): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET visibility = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, visibility]
    );
    return result.rows[0] ? mapCompetition(result.rows[0]) : null;
  }

  async updateAccessType(id: string, accessType: CompetitionAccessType): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET access_type = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, accessType]
    );
    return result.rows[0] ? mapCompetition(result.rows[0]) : null;
  }
}
