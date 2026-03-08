import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import type { UserSuspension } from "@script-manifest/contracts";

// ── Interface ────────────────────────────────────────────────────

export interface SuspensionRepository {
  init(): Promise<void>;
  suspendUser(userId: string, adminId: string, reason: string, durationDays?: number): Promise<UserSuspension>;
  getActiveSuspension(userId: string): Promise<UserSuspension | null>;
  getUserSuspensionHistory(userId: string): Promise<UserSuspension[]>;
  liftSuspension(suspensionId: string, adminId: string): Promise<boolean>;
  autoExpireSuspensions(): Promise<number>;
}

// ── Helpers ──────────────────────────────────────────────────────

function toISOString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

// ── In-Memory Implementation (for tests) ─────────────────────────

export class MemorySuspensionRepository implements SuspensionRepository {
  private suspensions: Array<{
    id: string;
    userId: string;
    reason: string;
    suspendedBy: string;
    durationDays: number | null;
    startedAt: string;
    expiresAt: string | null;
    liftedAt: string | null;
    liftedBy: string | null;
    createdAt: string;
  }> = [];

  async init(): Promise<void> { /* no-op */ }

  async suspendUser(userId: string, adminId: string, reason: string, durationDays?: number): Promise<UserSuspension> {
    const now = new Date();
    const expiresAt = durationDays
      ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const suspension = {
      id: `susp_${randomUUID()}`,
      userId,
      reason,
      suspendedBy: adminId,
      durationDays: durationDays ?? null,
      startedAt: now.toISOString(),
      expiresAt,
      liftedAt: null,
      liftedBy: null,
      createdAt: now.toISOString()
    };

    this.suspensions.push(suspension);
    return suspension;
  }

  async getActiveSuspension(userId: string): Promise<UserSuspension | null> {
    const now = new Date().toISOString();
    return this.suspensions.find(
      (s) =>
        s.userId === userId &&
        s.liftedAt === null &&
        (s.expiresAt === null || s.expiresAt > now)
    ) ?? null;
  }

  async getUserSuspensionHistory(userId: string): Promise<UserSuspension[]> {
    return this.suspensions
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async liftSuspension(suspensionId: string, adminId: string): Promise<boolean> {
    const suspension = this.suspensions.find((s) => s.id === suspensionId);
    if (!suspension || suspension.liftedAt !== null) return false;

    suspension.liftedAt = new Date().toISOString();
    suspension.liftedBy = adminId;
    return true;
  }

  async autoExpireSuspensions(): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    for (const s of this.suspensions) {
      if (s.liftedAt === null && s.expiresAt !== null && s.expiresAt <= now) {
        s.liftedAt = now;
        s.liftedBy = "system";
        count++;
      }
    }
    return count;
  }
}

// ── PostgreSQL Implementation ────────────────────────────────────

type SuspensionRow = {
  id: string;
  user_id: string;
  reason: string;
  suspended_by: string;
  duration_days: number | null;
  started_at: Date;
  expires_at: Date | null;
  lifted_at: Date | null;
  lifted_by: string | null;
  created_at: Date;
};

function mapRow(row: SuspensionRow): UserSuspension {
  return {
    id: row.id,
    userId: row.user_id,
    reason: row.reason,
    suspendedBy: row.suspended_by,
    durationDays: row.duration_days,
    startedAt: toISOString(row.started_at),
    expiresAt: row.expires_at ? toISOString(row.expires_at) : null,
    liftedAt: row.lifted_at ? toISOString(row.lifted_at) : null,
    liftedBy: row.lifted_by,
    createdAt: toISOString(row.created_at)
  };
}

export class PgSuspensionRepository implements SuspensionRepository {
  async init(): Promise<void> {
    // Tables created by migration 015_platform_operations.sql
  }

  async suspendUser(userId: string, adminId: string, reason: string, durationDays?: number): Promise<UserSuspension> {
    const db = getPool();
    const id = `susp_${randomUUID()}`;
    const expiresAt = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await db.query<SuspensionRow>(
      `INSERT INTO user_suspensions (id, user_id, reason, suspended_by, duration_days, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, reason, adminId, durationDays ?? null, expiresAt]
    );

    return mapRow(result.rows[0]!);
  }

  async getActiveSuspension(userId: string): Promise<UserSuspension | null> {
    const db = getPool();
    const result = await db.query<SuspensionRow>(
      `SELECT * FROM user_suspensions
       WHERE user_id = $1 AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async getUserSuspensionHistory(userId: string): Promise<UserSuspension[]> {
    const db = getPool();
    const result = await db.query<SuspensionRow>(
      `SELECT * FROM user_suspensions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(mapRow);
  }

  async liftSuspension(suspensionId: string, adminId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `UPDATE user_suspensions
       SET lifted_at = NOW(), lifted_by = $2
       WHERE id = $1 AND lifted_at IS NULL
       RETURNING id`,
      [suspensionId, adminId]
    );

    return result.rows.length > 0;
  }

  async autoExpireSuspensions(): Promise<number> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `UPDATE user_suspensions
       SET lifted_at = NOW(), lifted_by = 'system'
       WHERE lifted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= NOW()
       RETURNING id`
    );

    return result.rows.length;
  }
}
