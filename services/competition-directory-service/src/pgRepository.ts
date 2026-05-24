import { getPool, runMigrations, toFtsPrefixQuery } from "@script-manifest/db";
import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility, SaveCompetitionRequest, SavedCompetition } from "@script-manifest/contracts";
import { publishSearchSyncEvent } from "@script-manifest/service-utils";
import { searchCompetitions as typesenseSearch, type CompetitionDocument } from "@script-manifest/search";
import type { CompetitionDirectoryRepository, DueCompetitionReminderDispatch } from "./repository.js";

const typesenseEnabled = process.env.TYPESENSE_ENABLED === "true";

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
  location: string;
  language: string;
  fee_tier: string;
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
    ...(row.location ? { location: row.location } : {}),
    ...(row.language ? { language: row.language } : {}),
    ...(row.fee_tier ? { feeTier: row.fee_tier as Competition["feeTier"] } : {}),
    deadline: row.deadline.toISOString(),
    status: row.status as Competition["status"],
    visibility: row.visibility as Competition["visibility"],
    accessType: row.access_type as Competition["accessType"]
  };
}

function competitionRowToSyncPayload(row: CompetitionRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    genre: row.genre,
    feeUsd: Number(row.fee_usd),
    location: row.location,
    language: row.language,
    feeTier: row.fee_tier,
    deadline: row.deadline.toISOString(),
    status: row.status,
    visibility: row.visibility,
    accessType: row.access_type,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function typesenseDocToCompetition(doc: CompetitionDocument): Competition {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    format: doc.format,
    genre: doc.genre,
    feeUsd: doc.feeUsd,
    location: doc.location ?? "Worldwide",
    language: doc.language ?? "en",
    feeTier: doc.feeTier as Competition["feeTier"] ?? "free",
    deadline: new Date(doc.deadline * 1000).toISOString(),
    status: doc.status as Competition["status"],
    visibility: doc.visibility as Competition["visibility"],
    accessType: doc.accessType as Competition["accessType"],
  };
}

async function publishSync(operation: "upsert" | "delete", row: CompetitionRow | null, id: string): Promise<void> {
  try {
    await publishSearchSyncEvent({
      collection: "competitions",
      documentId: id,
      operation,
      payload: operation === "upsert" && row ? competitionRowToSyncPayload(row) : null,
    });
  } catch {
    // Search sync is best-effort — never block the write path
  }
}

export class PgCompetitionDirectoryRepository implements CompetitionDirectoryRepository {
  async init(): Promise<void> {
    if (process.env.SKIP_SCHEMA_INIT === "1") {
      return;
    }
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
      `INSERT INTO competitions (id, title, description, format, genre, fee_usd, deadline, location, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           format = EXCLUDED.format,
            genre = EXCLUDED.genre,
            fee_usd = EXCLUDED.fee_usd,
            deadline = EXCLUDED.deadline,
            location = EXCLUDED.location,
            language = EXCLUDED.language,
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
        competition.location ?? "Worldwide",
        competition.language ?? "en",
      ],
    );

    const row = result.rows[0];
    if (!row) {
      return { existed: false };
    }

    await publishSync("upsert", row, competition.id);
    if (row.xmax !== "0") {
      await this.rebuildUndispatchedRemindersForCompetition(competition.id);
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
    if (typesenseEnabled) {
      try {
        const tsResult = await typesenseSearch(filters);
        if (tsResult) {
          return tsResult.hits.map(typesenseDocToCompetition);
        }
      } catch {
        // Typesense unavailable — fall through to Postgres
      }
    }

    return this.listCompetitionsFromPostgres(filters);
  }

  private async listCompetitionsFromPostgres(filters: CompetitionFilters): Promise<Competition[]> {
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

    if (filters.location) {
      values.push(filters.location);
      conditions.push(`LOWER(location) = LOWER($${values.length})`);
    }

    if (filters.language) {
      values.push(filters.language);
      conditions.push(`LOWER(language) = LOWER($${values.length})`);
    }

    if (filters.feeTier) {
      values.push(filters.feeTier);
      conditions.push(`fee_tier = $${values.length}`);
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

  async saveCompetition(input: SaveCompetitionRequest & { competitionId: string }): Promise<SavedCompetition> {
    const db = getPool();
    const remindDaysBefore = input.remindDaysBefore ?? [14, 7, 1];
    const result = await db.query<{
      writer_id: string;
      competition_id: string;
      saved_at: Date;
      remind_days_before: number[];
    }>(
      `INSERT INTO saved_competitions (writer_id, competition_id, remind_days_before)
       VALUES ($1, $2, $3)
       ON CONFLICT (writer_id, competition_id) DO UPDATE
       SET remind_days_before = EXCLUDED.remind_days_before,
           saved_at = saved_competitions.saved_at
       RETURNING *`,
      [input.writerId, input.competitionId, remindDaysBefore]
    );

    await this.scheduleReminderRows(input.writerId, input.competitionId, remindDaysBefore);

    const row = result.rows[0];
    return {
      writerId: row?.writer_id ?? input.writerId,
      competitionId: row?.competition_id ?? input.competitionId,
      savedAt: (row?.saved_at ?? new Date()).toISOString(),
      remindDaysBefore: row?.remind_days_before ?? remindDaysBefore,
      competition: await this.getCompetition(input.competitionId) ?? undefined
    };
  }

  async unsaveCompetition(writerId: string, competitionId: string): Promise<boolean> {
    const db = getPool();
    await db.query(
      `DELETE FROM competition_reminder_dispatch
       WHERE writer_id = $1 AND competition_id = $2 AND dispatched_at IS NULL`,
      [writerId, competitionId]
    );
    const result = await db.query(
      `DELETE FROM saved_competitions WHERE writer_id = $1 AND competition_id = $2`,
      [writerId, competitionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listSavedCompetitions(writerId: string): Promise<SavedCompetition[]> {
    const db = getPool();
    const result = await db.query<CompetitionRow & {
      writer_id: string;
      competition_id: string;
      saved_at: Date;
      remind_days_before: number[];
    }>(
      `SELECT c.*, sc.writer_id, sc.competition_id, sc.saved_at, sc.remind_days_before
       FROM saved_competitions sc
       JOIN competitions c ON c.id = sc.competition_id
       WHERE sc.writer_id = $1
       ORDER BY c.deadline ASC`,
      [writerId]
    );

    return result.rows.map((row) => ({
      writerId: row.writer_id,
      competitionId: row.competition_id,
      savedAt: row.saved_at.toISOString(),
      remindDaysBefore: row.remind_days_before,
      competition: mapCompetition(row)
    }));
  }

  async listDueReminderDispatches(limit = 50): Promise<DueCompetitionReminderDispatch[]> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      writer_id: string;
      competition_id: string;
      fire_at: Date;
      title: string;
      deadline: Date;
    }>(
      `SELECT crd.id, crd.writer_id, crd.competition_id, crd.fire_at, c.title, c.deadline
       FROM competition_reminder_dispatch crd
       JOIN competitions c ON c.id = crd.competition_id
       WHERE crd.fire_at <= NOW() AND crd.dispatched_at IS NULL
       ORDER BY crd.fire_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      writerId: row.writer_id,
      competitionId: row.competition_id,
      fireAt: row.fire_at,
      competitionTitle: row.title,
      competitionDeadline: row.deadline.toISOString()
    }));
  }

  async markReminderDispatched(id: string, notificationEventId: string): Promise<void> {
    await getPool().query(
      `UPDATE competition_reminder_dispatch
       SET dispatched_at = COALESCE(dispatched_at, NOW()), notification_event_id = COALESCE(notification_event_id, $2)
       WHERE id = $1 AND dispatched_at IS NULL`,
      [id, notificationEventId]
    );
  }

  private async scheduleReminderRows(writerId: string, competitionId: string, remindDaysBefore: number[]): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO competition_reminder_dispatch (id, writer_id, competition_id, fire_at)
       SELECT 'crd_' || md5($1 || ':' || $2 || ':' || (c.deadline - (days_before || ' days')::interval)::text),
              $1,
              $2,
              c.deadline - (days_before || ' days')::interval
       FROM competitions c
       CROSS JOIN unnest($3::int[]) AS days_before
       WHERE c.id = $2 AND c.deadline - (days_before || ' days')::interval >= NOW()
       ON CONFLICT (writer_id, competition_id, fire_at) DO NOTHING`,
      [writerId, competitionId, remindDaysBefore]
    );
  }

  private async rebuildUndispatchedRemindersForCompetition(competitionId: string): Promise<void> {
    const db = getPool();
    const saved = await db.query<{ writer_id: string; remind_days_before: number[] }>(
      `SELECT writer_id, remind_days_before FROM saved_competitions WHERE competition_id = $1`,
      [competitionId]
    );
    await db.query(
      `DELETE FROM competition_reminder_dispatch WHERE competition_id = $1 AND dispatched_at IS NULL`,
      [competitionId]
    );
    for (const row of saved.rows) {
      await this.scheduleReminderRows(row.writer_id, competitionId, row.remind_days_before);
    }
  }

  async cancelCompetition(id: string): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return null;

    await publishSync("upsert", row, id);
    return mapCompetition(row);
  }

  async updateVisibility(id: string, visibility: CompetitionVisibility): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET visibility = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, visibility]
    );
    const row = result.rows[0];
    if (!row) return null;

    await publishSync("upsert", row, id);
    return mapCompetition(row);
  }

  async updateAccessType(id: string, accessType: CompetitionAccessType): Promise<Competition | null> {
    const db = getPool();
    const result = await db.query<CompetitionRow>(
      `UPDATE competitions SET access_type = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, accessType]
    );
    const row = result.rows[0];
    if (!row) return null;

    await publishSync("upsert", row, id);
    return mapCompetition(row);
  }
}
