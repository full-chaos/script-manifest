import { randomUUID } from "node:crypto";
import type {
  AntiGamingFlag,
  AntiGamingFlagReason,
  AntiGamingFlagStatus,
  CompetitionPrestige,
  PrestigeTier,
  RankedLeaderboardFilters,
  RankedWriterEntry,
  RankingAppeal,
  RankingAppealStatus,
  TierDesignation,
  WriterBadge
} from "@script-manifest/contracts";
import { ensureRankingTables, getPool } from "@script-manifest/db";

export type WriterScoreRow = {
  writerId: string;
  totalScore: number;
  submissionCount: number;
  placementCount: number;
  rank: number | null;
  tier: TierDesignation | null;
  scoreChange30d: number;
  lastUpdatedAt: string;
};

export type PlacementScoreRow = {
  placementId: string;
  writerId: string;
  competitionId: string;
  projectId: string;
  statusWeight: number;
  prestigeMultiplier: number;
  verificationMultiplier: number;
  timeDecayFactor: number;
  confidenceFactor: number;
  rawScore: number;
  placementDate: string;
};

export interface RankingRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  // Prestige
  getPrestige(competitionId: string): Promise<CompetitionPrestige | null>;
  upsertPrestige(competitionId: string, tier: PrestigeTier, multiplier: number): Promise<CompetitionPrestige>;
  listPrestige(): Promise<CompetitionPrestige[]>;

  // Writer scores
  getWriterScore(writerId: string): Promise<WriterScoreRow | null>;
  upsertWriterScore(row: WriterScoreRow): Promise<void>;
  bulkUpsertWriterScores(rows: WriterScoreRow[]): Promise<void>;
  listLeaderboard(filters: RankedLeaderboardFilters, allowedWriterIds: Set<string> | null): Promise<{ entries: RankedWriterEntry[]; total: number }>;
  getTotalRankedWriters(): Promise<number>;

  // Placement scores
  upsertPlacementScore(row: PlacementScoreRow): Promise<void>;
  bulkUpsertPlacementScores(rows: PlacementScoreRow[]): Promise<void>;
  getPlacementScores(writerId: string): Promise<PlacementScoreRow[]>;
  clearPlacementScores(): Promise<void>;

  // Badges
  awardBadge(writerId: string, label: string, placementId: string, competitionId: string): Promise<WriterBadge>;
  getBadges(writerId: string): Promise<WriterBadge[]>;
  hasBadge(placementId: string): Promise<boolean>;

  // Snapshots
  createSnapshot(writerId: string, totalScore: number): Promise<void>;
  bulkCreateSnapshots(rows: Array<{ writerId: string; totalScore: number }>): Promise<void>;
  getSnapshotScore(writerId: string, daysAgo: number): Promise<number | null>;

  // Anti-gaming
  createFlag(writerId: string, reason: AntiGamingFlagReason, details: string): Promise<AntiGamingFlag>;
  getFlag(flagId: string): Promise<AntiGamingFlag | null>;
  listFlags(status?: AntiGamingFlagStatus): Promise<AntiGamingFlag[]>;
  resolveFlag(flagId: string, resolvedByUserId: string, status: "dismissed" | "confirmed"): Promise<AntiGamingFlag | null>;

  // Appeals
  createAppeal(writerId: string, reason: string): Promise<RankingAppeal>;
  getAppeal(appealId: string): Promise<RankingAppeal | null>;
  listAppeals(status?: RankingAppealStatus): Promise<RankingAppeal[]>;
  resolveAppeal(appealId: string, resolvedByUserId: string, status: "upheld" | "rejected", resolutionNote: string): Promise<RankingAppeal | null>;
}

// ── PostgreSQL implementation ────────────────────────────────────────

export class PgRankingRepository implements RankingRepository {
  async init(): Promise<void> {
    await ensureRankingTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  // ── Prestige ──

  async getPrestige(competitionId: string): Promise<CompetitionPrestige | null> {
    const { rows } = await getPool().query(
      "SELECT competition_id, tier, multiplier, updated_at FROM competition_prestige WHERE competition_id = $1",
      [competitionId]
    );
    return rows[0] ? mapPrestige(rows[0]) : null;
  }

  async upsertPrestige(competitionId: string, tier: PrestigeTier, multiplier: number): Promise<CompetitionPrestige> {
    const { rows } = await getPool().query(
      `INSERT INTO competition_prestige (competition_id, tier, multiplier, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (competition_id) DO UPDATE SET tier = $2, multiplier = $3, updated_at = NOW()
       RETURNING competition_id, tier, multiplier, updated_at`,
      [competitionId, tier, multiplier]
    );
    return mapPrestige(rows[0]);
  }

  async listPrestige(): Promise<CompetitionPrestige[]> {
    const { rows } = await getPool().query(
      "SELECT competition_id, tier, multiplier, updated_at FROM competition_prestige ORDER BY competition_id"
    );
    return rows.map(mapPrestige);
  }

  // ── Writer scores ──

  async getWriterScore(writerId: string): Promise<WriterScoreRow | null> {
    const { rows } = await getPool().query(
      "SELECT * FROM writer_scores WHERE writer_id = $1",
      [writerId]
    );
    return rows[0] ? mapWriterScore(rows[0]) : null;
  }

  async upsertWriterScore(row: WriterScoreRow): Promise<void> {
    await getPool().query(
      `INSERT INTO writer_scores (writer_id, total_score, submission_count, placement_count, rank, tier, score_change_30d, last_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (writer_id) DO UPDATE SET
         total_score = $2, submission_count = $3, placement_count = $4,
         rank = $5, tier = $6, score_change_30d = $7, last_updated_at = $8`,
      [row.writerId, row.totalScore, row.submissionCount, row.placementCount, row.rank, row.tier, row.scoreChange30d, row.lastUpdatedAt]
    );
  }

  async bulkUpsertWriterScores(rows: WriterScoreRow[]): Promise<void> {
    for (const row of rows) {
      await this.upsertWriterScore(row);
    }
  }

  async listLeaderboard(filters: RankedLeaderboardFilters, allowedWriterIds: Set<string> | null): Promise<{ entries: RankedWriterEntry[]; total: number }> {
    let where = "WHERE total_score > 0";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.tier) {
      where += ` AND tier = $${paramIndex++}`;
      params.push(filters.tier);
    }

    if (allowedWriterIds !== null) {
      if (allowedWriterIds.size === 0) return { entries: [], total: 0 };
      where += ` AND writer_id = ANY($${paramIndex++})`;
      params.push([...allowedWriterIds]);
    }

    const countResult = await getPool().query(`SELECT COUNT(*)::int as total FROM writer_scores ${where}`, params);
    const total = countResult.rows[0]?.total ?? 0;

    const orderBy = filters.trending ? "ORDER BY score_change_30d DESC, total_score DESC" : "ORDER BY rank ASC NULLS LAST, total_score DESC";
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const { rows } = await getPool().query(
      `SELECT * FROM writer_scores ${where} ${orderBy} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const entries: RankedWriterEntry[] = [];
    for (const row of rows) {
      const score = mapWriterScore(row);
      const badges = await this.getBadges(score.writerId);
      entries.push({
        writerId: score.writerId,
        rank: score.rank ?? 0,
        totalScore: score.totalScore,
        submissionCount: score.submissionCount,
        placementCount: score.placementCount,
        tier: score.tier,
        badges: badges.map((b) => b.label),
        scoreChange30d: score.scoreChange30d,
        lastUpdatedAt: score.lastUpdatedAt
      });
    }

    return { entries, total };
  }

  async getTotalRankedWriters(): Promise<number> {
    const { rows } = await getPool().query("SELECT COUNT(*)::int as total FROM writer_scores WHERE total_score > 0");
    return rows[0]?.total ?? 0;
  }

  // ── Placement scores ──

  async upsertPlacementScore(row: PlacementScoreRow): Promise<void> {
    await getPool().query(
      `INSERT INTO placement_scores (placement_id, writer_id, competition_id, project_id, status_weight, prestige_multiplier, verification_multiplier, time_decay_factor, confidence_factor, raw_score, placement_date, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (placement_id) DO UPDATE SET
         status_weight = $5, prestige_multiplier = $6, verification_multiplier = $7,
         time_decay_factor = $8, confidence_factor = $9, raw_score = $10, computed_at = NOW()`,
      [row.placementId, row.writerId, row.competitionId, row.projectId, row.statusWeight, row.prestigeMultiplier, row.verificationMultiplier, row.timeDecayFactor, row.confidenceFactor, row.rawScore, row.placementDate]
    );
  }

  async bulkUpsertPlacementScores(rows: PlacementScoreRow[]): Promise<void> {
    for (const row of rows) {
      await this.upsertPlacementScore(row);
    }
  }

  async getPlacementScores(writerId: string): Promise<PlacementScoreRow[]> {
    const { rows } = await getPool().query(
      "SELECT * FROM placement_scores WHERE writer_id = $1 ORDER BY placement_date DESC",
      [writerId]
    );
    return rows.map(mapPlacementScore);
  }

  async clearPlacementScores(): Promise<void> {
    await getPool().query("DELETE FROM placement_scores");
  }

  // ── Badges ──

  async awardBadge(writerId: string, label: string, placementId: string, competitionId: string): Promise<WriterBadge> {
    const id = `badge_${randomUUID()}`;
    const now = new Date().toISOString();
    await getPool().query(
      `INSERT INTO writer_badges (id, writer_id, label, placement_id, competition_id, awarded_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (placement_id) DO NOTHING`,
      [id, writerId, label, placementId, competitionId, now]
    );
    return { id, writerId, label, placementId, competitionId, awardedAt: now };
  }

  async getBadges(writerId: string): Promise<WriterBadge[]> {
    const { rows } = await getPool().query(
      "SELECT * FROM writer_badges WHERE writer_id = $1 ORDER BY awarded_at DESC",
      [writerId]
    );
    return rows.map(mapBadge);
  }

  async hasBadge(placementId: string): Promise<boolean> {
    const { rows } = await getPool().query(
      "SELECT 1 FROM writer_badges WHERE placement_id = $1",
      [placementId]
    );
    return rows.length > 0;
  }

  // ── Snapshots ──

  async createSnapshot(writerId: string, totalScore: number): Promise<void> {
    const id = `snap_${randomUUID()}`;
    await getPool().query(
      `INSERT INTO score_snapshots (id, writer_id, total_score, snapshot_date)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (writer_id, snapshot_date) DO UPDATE SET total_score = $3`,
      [id, writerId, totalScore]
    );
  }

  async bulkCreateSnapshots(rows: Array<{ writerId: string; totalScore: number }>): Promise<void> {
    for (const row of rows) {
      await this.createSnapshot(row.writerId, row.totalScore);
    }
  }

  async getSnapshotScore(writerId: string, daysAgo: number): Promise<number | null> {
    const { rows } = await getPool().query(
      `SELECT total_score FROM score_snapshots
       WHERE writer_id = $1 AND snapshot_date <= CURRENT_DATE - $2::int
       ORDER BY snapshot_date DESC LIMIT 1`,
      [writerId, daysAgo]
    );
    return rows[0] ? Number(rows[0].total_score) : null;
  }

  // ── Anti-gaming ──

  async createFlag(writerId: string, reason: AntiGamingFlagReason, details: string): Promise<AntiGamingFlag> {
    const id = `flag_${randomUUID()}`;
    const now = new Date().toISOString();
    await getPool().query(
      `INSERT INTO anti_gaming_flags (id, writer_id, reason, details, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'open', $5, $5)`,
      [id, writerId, reason, details, now]
    );
    return { id, writerId, reason, details, status: "open", resolvedByUserId: null, createdAt: now, updatedAt: now };
  }

  async getFlag(flagId: string): Promise<AntiGamingFlag | null> {
    const { rows } = await getPool().query("SELECT * FROM anti_gaming_flags WHERE id = $1", [flagId]);
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  async listFlags(status?: AntiGamingFlagStatus): Promise<AntiGamingFlag[]> {
    if (status) {
      const { rows } = await getPool().query("SELECT * FROM anti_gaming_flags WHERE status = $1 ORDER BY created_at DESC", [status]);
      return rows.map(mapFlag);
    }
    const { rows } = await getPool().query("SELECT * FROM anti_gaming_flags ORDER BY created_at DESC");
    return rows.map(mapFlag);
  }

  async resolveFlag(flagId: string, resolvedByUserId: string, status: "dismissed" | "confirmed"): Promise<AntiGamingFlag | null> {
    const { rows } = await getPool().query(
      `UPDATE anti_gaming_flags SET status = $2, resolved_by_user_id = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [flagId, status, resolvedByUserId]
    );
    return rows[0] ? mapFlag(rows[0]) : null;
  }

  // ── Appeals ──

  async createAppeal(writerId: string, reason: string): Promise<RankingAppeal> {
    const id = `appeal_${randomUUID()}`;
    const now = new Date().toISOString();
    await getPool().query(
      `INSERT INTO ranking_appeals (id, writer_id, reason, status, created_at, updated_at) VALUES ($1, $2, $3, 'open', $4, $4)`,
      [id, writerId, reason, now]
    );
    return { id, writerId, reason, status: "open", resolutionNote: null, resolvedByUserId: null, createdAt: now, updatedAt: now };
  }

  async getAppeal(appealId: string): Promise<RankingAppeal | null> {
    const { rows } = await getPool().query("SELECT * FROM ranking_appeals WHERE id = $1", [appealId]);
    return rows[0] ? mapAppeal(rows[0]) : null;
  }

  async listAppeals(status?: RankingAppealStatus): Promise<RankingAppeal[]> {
    if (status) {
      const { rows } = await getPool().query("SELECT * FROM ranking_appeals WHERE status = $1 ORDER BY created_at DESC", [status]);
      return rows.map(mapAppeal);
    }
    const { rows } = await getPool().query("SELECT * FROM ranking_appeals ORDER BY created_at DESC");
    return rows.map(mapAppeal);
  }

  async resolveAppeal(appealId: string, resolvedByUserId: string, status: "upheld" | "rejected", resolutionNote: string): Promise<RankingAppeal | null> {
    const { rows } = await getPool().query(
      `UPDATE ranking_appeals SET status = $2, resolved_by_user_id = $3, resolution_note = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [appealId, status, resolvedByUserId, resolutionNote]
    );
    return rows[0] ? mapAppeal(rows[0]) : null;
  }
}

// ── Row mappers ──────────────────────────────────────────────────────

function mapPrestige(row: Record<string, unknown>): CompetitionPrestige {
  return {
    competitionId: row.competition_id as string,
    tier: row.tier as PrestigeTier,
    multiplier: Number(row.multiplier),
    updatedAt: (row.updated_at as Date).toISOString()
  };
}

function mapWriterScore(row: Record<string, unknown>): WriterScoreRow {
  return {
    writerId: row.writer_id as string,
    totalScore: Number(row.total_score),
    submissionCount: Number(row.submission_count),
    placementCount: Number(row.placement_count),
    rank: row.rank != null ? Number(row.rank) : null,
    tier: (row.tier as TierDesignation | null) ?? null,
    scoreChange30d: Number(row.score_change_30d),
    lastUpdatedAt: (row.last_updated_at as Date).toISOString()
  };
}

function mapPlacementScore(row: Record<string, unknown>): PlacementScoreRow {
  return {
    placementId: row.placement_id as string,
    writerId: row.writer_id as string,
    competitionId: row.competition_id as string,
    projectId: row.project_id as string,
    statusWeight: Number(row.status_weight),
    prestigeMultiplier: Number(row.prestige_multiplier),
    verificationMultiplier: Number(row.verification_multiplier),
    timeDecayFactor: Number(row.time_decay_factor),
    confidenceFactor: Number(row.confidence_factor),
    rawScore: Number(row.raw_score),
    placementDate: (row.placement_date as Date).toISOString()
  };
}

function mapBadge(row: Record<string, unknown>): WriterBadge {
  return {
    id: row.id as string,
    writerId: row.writer_id as string,
    label: row.label as string,
    placementId: row.placement_id as string,
    competitionId: row.competition_id as string,
    awardedAt: (row.awarded_at as Date).toISOString()
  };
}

function mapFlag(row: Record<string, unknown>): AntiGamingFlag {
  return {
    id: row.id as string,
    writerId: row.writer_id as string,
    reason: row.reason as AntiGamingFlagReason,
    details: (row.details as string) ?? "",
    status: row.status as AntiGamingFlagStatus,
    resolvedByUserId: (row.resolved_by_user_id as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString()
  };
}

function mapAppeal(row: Record<string, unknown>): RankingAppeal {
  return {
    id: row.id as string,
    writerId: row.writer_id as string,
    reason: row.reason as string,
    status: row.status as RankingAppealStatus,
    resolutionNote: (row.resolution_note as string) ?? null,
    resolvedByUserId: (row.resolved_by_user_id as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString()
  };
}
