import { randomUUID, createHash } from "node:crypto";
import { getPool } from "@script-manifest/db";
import type { FeatureFlag } from "@script-manifest/contracts";

// ── Types ────────────────────────────────────────────────────────

export type CreateFlagInput = {
  key: string;
  description?: string;
  enabled?: boolean;
};

export type UpdateFlagInput = {
  enabled?: boolean;
  description?: string;
  rolloutPct?: number;
  userAllowlist?: string[];
};

// ── Interface ────────────────────────────────────────────────────

export interface FeatureFlagRepository {
  init(): Promise<void>;
  createFlag(key: string, description: string, adminId: string): Promise<FeatureFlag>;
  listFlags(): Promise<FeatureFlag[]>;
  getFlagByKey(key: string): Promise<FeatureFlag | null>;
  updateFlag(key: string, updates: UpdateFlagInput, adminId: string): Promise<FeatureFlag | null>;
  deleteFlag(key: string): Promise<boolean>;
  evaluateFlags(userId?: string): Promise<Record<string, boolean>>;
}

// ── Flag evaluation helpers ──────────────────────────────────────

function hashToPercent(userId: string, flagKey: string): number {
  const hash = createHash("sha256").update(`${userId}:${flagKey}`).digest();
  // Use first 4 bytes as a uint32, mod 100
  const value = hash.readUInt32BE(0);
  return value % 100;
}

function evaluateFlag(flag: FeatureFlag, userId?: string): boolean {
  if (!flag.enabled) return false;
  if (userId && flag.userAllowlist.includes(userId)) return true;
  if (flag.rolloutPct >= 100) return true;
  if (flag.rolloutPct > 0 && userId) {
    return hashToPercent(userId, flag.key) < flag.rolloutPct;
  }
  return flag.rolloutPct > 0 ? false : false;
}

// ── In-Memory Implementation (for tests) ─────────────────────────

export class MemoryFeatureFlagRepository implements FeatureFlagRepository {
  private flags = new Map<string, FeatureFlag>();

  async init(): Promise<void> { /* no-op */ }

  async createFlag(key: string, description: string, adminId: string): Promise<FeatureFlag> {
    if (this.flags.has(key)) {
      throw new Error("flag_already_exists");
    }
    const now = new Date().toISOString();
    const flag: FeatureFlag = {
      key,
      description,
      enabled: false,
      rolloutPct: 0,
      userAllowlist: [],
      updatedBy: adminId,
      createdAt: now,
      updatedAt: now
    };
    this.flags.set(key, flag);
    return flag;
  }

  async listFlags(): Promise<FeatureFlag[]> {
    return [...this.flags.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  async getFlagByKey(key: string): Promise<FeatureFlag | null> {
    return this.flags.get(key) ?? null;
  }

  async updateFlag(key: string, updates: UpdateFlagInput, adminId: string): Promise<FeatureFlag | null> {
    const existing = this.flags.get(key);
    if (!existing) return null;

    const updated: FeatureFlag = {
      ...existing,
      ...(updates.enabled !== undefined && { enabled: updates.enabled }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.rolloutPct !== undefined && { rolloutPct: updates.rolloutPct }),
      ...(updates.userAllowlist !== undefined && { userAllowlist: updates.userAllowlist }),
      updatedBy: adminId,
      updatedAt: new Date().toISOString()
    };
    this.flags.set(key, updated);
    return updated;
  }

  async deleteFlag(key: string): Promise<boolean> {
    return this.flags.delete(key);
  }

  async evaluateFlags(userId?: string): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const flag of this.flags.values()) {
      result[flag.key] = evaluateFlag(flag, userId);
    }
    return result;
  }
}

// ── PostgreSQL Implementation ────────────────────────────────────

function toISOString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

type FlagRow = {
  key: string;
  description: string;
  enabled: boolean;
  rollout_pct: number;
  user_allowlist: string[];
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapFlagRow(row: FlagRow): FeatureFlag {
  return {
    key: row.key,
    description: row.description,
    enabled: row.enabled,
    rolloutPct: row.rollout_pct,
    userAllowlist: row.user_allowlist ?? [],
    updatedBy: row.updated_by,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at)
  };
}

export class PgFeatureFlagRepository implements FeatureFlagRepository {
  async init(): Promise<void> {
    // Table created by migration 015_platform_operations.sql
  }

  async createFlag(key: string, description: string, adminId: string): Promise<FeatureFlag> {
    const db = getPool();
    const result = await db.query<FlagRow>(
      `INSERT INTO feature_flags (key, description, updated_by)
       VALUES ($1, $2, $3)
       RETURNING key, description, enabled, rollout_pct, user_allowlist, updated_by, created_at, updated_at`,
      [key, description, adminId]
    );
    return mapFlagRow(result.rows[0]!);
  }

  async listFlags(): Promise<FeatureFlag[]> {
    const db = getPool();
    const result = await db.query<FlagRow>(
      `SELECT key, description, enabled, rollout_pct, user_allowlist, updated_by, created_at, updated_at
       FROM feature_flags ORDER BY key`
    );
    return result.rows.map(mapFlagRow);
  }

  async getFlagByKey(key: string): Promise<FeatureFlag | null> {
    const db = getPool();
    const result = await db.query<FlagRow>(
      `SELECT key, description, enabled, rollout_pct, user_allowlist, updated_by, created_at, updated_at
       FROM feature_flags WHERE key = $1`,
      [key]
    );
    const row = result.rows[0];
    return row ? mapFlagRow(row) : null;
  }

  async updateFlag(key: string, updates: UpdateFlagInput, adminId: string): Promise<FeatureFlag | null> {
    const db = getPool();
    const setClauses: string[] = ["updated_by = $1", "updated_at = NOW()"];
    const values: unknown[] = [adminId];
    let paramIndex = 2;

    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex}`);
      values.push(updates.enabled);
      paramIndex++;
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      values.push(updates.description);
      paramIndex++;
    }
    if (updates.rolloutPct !== undefined) {
      setClauses.push(`rollout_pct = $${paramIndex}`);
      values.push(updates.rolloutPct);
      paramIndex++;
    }
    if (updates.userAllowlist !== undefined) {
      setClauses.push(`user_allowlist = $${paramIndex}`);
      values.push(updates.userAllowlist);
      paramIndex++;
    }

    values.push(key);
    const result = await db.query<FlagRow>(
      `UPDATE feature_flags SET ${setClauses.join(", ")} WHERE key = $${paramIndex}
       RETURNING key, description, enabled, rollout_pct, user_allowlist, updated_by, created_at, updated_at`,
      values
    );
    const row = result.rows[0];
    return row ? mapFlagRow(row) : null;
  }

  async deleteFlag(key: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ key: string }>(
      `DELETE FROM feature_flags WHERE key = $1 RETURNING key`,
      [key]
    );
    return result.rows.length > 0;
  }

  async evaluateFlags(userId?: string): Promise<Record<string, boolean>> {
    const flags = await this.listFlags();
    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      result[flag.key] = evaluateFlag(flag, userId);
    }
    return result;
  }
}
