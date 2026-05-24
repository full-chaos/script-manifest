import { randomUUID } from "node:crypto";
import { getPool, runMigrations, toFtsPrefixQuery } from "@script-manifest/db";
import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility, Project, SaveCompetitionRequest, SavedCompetition } from "@script-manifest/contracts";
import { publishSearchSyncEvent } from "@script-manifest/service-utils";
import { searchCompetitions as typesenseSearch, type CompetitionDocument } from "@script-manifest/search";
import type { CompetitionAuditLogEntry, CompetitionAuditLogInput, CompetitionDirectoryRepository, DueCompetitionReminderDispatch, FeeTier, PrestigeTier, RecommendationInput } from "./repository.js";

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

type ProjectRow = {
  id: string;
  owner_user_id: string;
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  language: string;
  country: string | null;
  page_count: number;
  is_discoverable: boolean;
  created_at: Date;
  updated_at: Date;
};

type RecommendationCompetitionRow = CompetitionRow & {
  is_dismissed: boolean;
  is_pinned: boolean;
  already_submitted: boolean;
  prestige_tier: string | null;
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

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    logline: row.logline,
    synopsis: row.synopsis,
    format: row.format,
    genre: row.genre,
    language: row.language,
    country: row.country,
    pageCount: row.page_count,
    isDiscoverable: row.is_discoverable,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
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

function normalizePrestigeTier(value: string | null): PrestigeTier {
  if (value === "elite" || value === "premier" || value === "notable" || value === "standard") {
    return value;
  }
  return "standard";
}

function mostCommonFeeTier(values: FeeTier[]): FeeTier | null {
  if (values.length === 0) return null;
  const counts = new Map<FeeTier, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export class PgCompetitionDirectoryRepository implements CompetitionDirectoryRepository {
  async init(): Promise<void> {
    if (process.env.SKIP_SCHEMA_INIT === "1") {
      return;
    }
    await runMigrations(getPool());
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS competition_audit_log (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async createAuditLogEntry(input: CompetitionAuditLogInput): Promise<CompetitionAuditLogEntry> {
    const id = `audit_${randomUUID()}`;
    const result = await getPool().query<{
      id: string;
      admin_user_id: string;
      action: CompetitionAuditLogEntry["action"];
      target_type: string;
      target_id: string;
      details: Record<string, unknown> | null;
      created_at: Date;
    }>(
      `INSERT INTO competition_audit_log (id, admin_user_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, admin_user_id, action, target_type, target_id, details, created_at`,
      [id, input.adminUserId, input.action, input.targetType, input.targetId, input.details ?? null]
    );
    const row = result.rows[0]!;
    return {
      id: row.id,
      adminUserId: row.admin_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details ?? undefined,
      createdAt: row.created_at.toISOString()
    };
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

  async getRecommendationContext(projectId: string, userId: string): Promise<{
    project: Project;
    competitions: RecommendationInput[];
    preferredFeeTier: FeeTier | null;
  } | null> {
    const db = getPool();
    const projectResult = await db.query<ProjectRow>(
      `SELECT * FROM projects WHERE id = $1 AND owner_user_id = $2`,
      [projectId, userId]
    );
    const projectRow = projectResult.rows[0];
    if (!projectRow) return null;

    const competitionResult = await db.query<RecommendationCompetitionRow>(
      `SELECT c.*,
              (pcd.competition_id IS NOT NULL) AS is_dismissed,
              (pcp.competition_id IS NOT NULL) AS is_pinned,
              (s.competition_id IS NOT NULL) AS already_submitted,
              cp.tier AS prestige_tier
       FROM competitions c
       LEFT JOIN project_competition_dismissals pcd
         ON pcd.project_id = $1 AND pcd.competition_id = c.id
       LEFT JOIN project_competition_pins pcp
         ON pcp.project_id = $1 AND pcp.competition_id = c.id
       LEFT JOIN submissions s
         ON s.project_id = $1 AND s.competition_id = c.id
       LEFT JOIN competition_prestige cp
         ON cp.competition_id = c.id
       WHERE c.status = 'active'
         AND c.visibility = 'listed'
         AND c.deadline > NOW()
       ORDER BY c.deadline ASC`,
      [projectId]
    );

    const feeResult = await db.query<{ fee_tier: FeeTier }>(
      `SELECT c.fee_tier
       FROM submissions s
       JOIN competitions c ON c.id = s.competition_id
       WHERE s.writer_id = $1 AND c.fee_tier IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT 5`,
      [userId]
    );

    return {
      project: mapProject(projectRow),
      competitions: competitionResult.rows.map((row) => ({
        competition: mapCompetition(row),
        isDismissed: row.is_dismissed,
        isPinned: row.is_pinned,
        alreadySubmitted: row.already_submitted,
        prestigeTier: normalizePrestigeTier(row.prestige_tier)
      })),
      preferredFeeTier: mostCommonFeeTier(feeResult.rows.map((row) => row.fee_tier))
    };
  }

  async dismissRecommendation(projectId: string, competitionId: string, userId: string): Promise<boolean> {
    const result = await getPool().query(
      `INSERT INTO project_competition_dismissals (project_id, competition_id, dismissed_by_user_id)
       SELECT $1, $2, $3
       WHERE EXISTS (SELECT 1 FROM projects WHERE id = $1 AND owner_user_id = $3)
       ON CONFLICT (project_id, competition_id) DO UPDATE
       SET dismissed_by_user_id = EXCLUDED.dismissed_by_user_id,
           dismissed_at = NOW()`,
      [projectId, competitionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async undismissRecommendation(projectId: string, competitionId: string, userId: string): Promise<boolean> {
    const result = await getPool().query(
      `DELETE FROM project_competition_dismissals
       WHERE project_id = $1 AND competition_id = $2
         AND EXISTS (SELECT 1 FROM projects WHERE id = $1 AND owner_user_id = $3)`,
      [projectId, competitionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async pinRecommendation(projectId: string, competitionId: string, userId: string): Promise<boolean> {
    const result = await getPool().query(
      `INSERT INTO project_competition_pins (project_id, competition_id, pinned_by_user_id)
       SELECT $1, $2, $3
       WHERE EXISTS (SELECT 1 FROM projects WHERE id = $1 AND owner_user_id = $3)
       ON CONFLICT (project_id, competition_id) DO UPDATE
       SET pinned_by_user_id = EXCLUDED.pinned_by_user_id,
           pinned_at = NOW()`,
      [projectId, competitionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async unpinRecommendation(projectId: string, competitionId: string, userId: string): Promise<boolean> {
    const result = await getPool().query(
      `DELETE FROM project_competition_pins
       WHERE project_id = $1 AND competition_id = $2
         AND EXISTS (SELECT 1 FROM projects WHERE id = $1 AND owner_user_id = $3)`,
      [projectId, competitionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
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
