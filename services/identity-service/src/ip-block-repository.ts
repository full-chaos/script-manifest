import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import type { IpBlockEntry } from "@script-manifest/contracts";

// ── Interface ────────────────────────────────────────────────────

export interface IpBlockRepository {
  init(): Promise<void>;
  addBlock(ipAddress: string, reason: string, blockedBy: string, expiresInHours?: number): Promise<IpBlockEntry>;
  removeBlock(id: string): Promise<boolean>;
  isBlocked(ipAddress: string): Promise<boolean>;
  listBlocks(page: number, limit: number, includeExpired?: boolean): Promise<{ blocks: IpBlockEntry[]; total: number }>;
}

// ── Helpers ──────────────────────────────────────────────────────

function toISOString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

// ── In-Memory Implementation (for tests) ─────────────────────────

export class MemoryIpBlockRepository implements IpBlockRepository {
  private blocks: Array<{
    id: string;
    ipAddress: string;
    reason: string;
    blockedBy: string;
    autoBlocked: boolean;
    expiresAt: string | null;
    createdAt: string;
  }> = [];

  async init(): Promise<void> { /* no-op */ }

  async addBlock(ipAddress: string, reason: string, blockedBy: string, expiresInHours?: number): Promise<IpBlockEntry> {
    const now = new Date();
    const expiresAt = expiresInHours
      ? new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

    const block = {
      id: `ipb_${randomUUID()}`,
      ipAddress,
      reason,
      blockedBy,
      autoBlocked: false,
      expiresAt,
      createdAt: now.toISOString()
    };

    this.blocks.push(block);
    return block;
  }

  async removeBlock(id: string): Promise<boolean> {
    const idx = this.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    this.blocks.splice(idx, 1);
    return true;
  }

  async isBlocked(ipAddress: string): Promise<boolean> {
    const now = new Date().toISOString();
    return this.blocks.some(
      (b) =>
        b.ipAddress === ipAddress &&
        (b.expiresAt === null || b.expiresAt > now)
    );
  }

  async listBlocks(page: number, limit: number, includeExpired = false): Promise<{ blocks: IpBlockEntry[]; total: number }> {
    const now = new Date().toISOString();
    let filtered = includeExpired
      ? [...this.blocks]
      : this.blocks.filter((b) => b.expiresAt === null || b.expiresAt > now);

    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = filtered.length;
    const offset = (page - 1) * limit;
    return { blocks: filtered.slice(offset, offset + limit), total };
  }
}

// ── PostgreSQL Implementation ────────────────────────────────────

type IpBlockRow = {
  id: string;
  ip_address: string;
  reason: string;
  blocked_by: string;
  auto_blocked: boolean;
  expires_at: Date | null;
  created_at: Date;
};

function mapRow(row: IpBlockRow): IpBlockEntry {
  return {
    id: row.id,
    ipAddress: row.ip_address,
    reason: row.reason,
    blockedBy: row.blocked_by,
    autoBlocked: row.auto_blocked,
    expiresAt: row.expires_at ? toISOString(row.expires_at) : null,
    createdAt: toISOString(row.created_at)
  };
}

export class PgIpBlockRepository implements IpBlockRepository {
  async init(): Promise<void> {
    // Tables created by migration 015_platform_operations.sql
  }

  async addBlock(ipAddress: string, reason: string, blockedBy: string, expiresInHours?: number): Promise<IpBlockEntry> {
    const db = getPool();
    const id = `ipb_${randomUUID()}`;
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    const result = await db.query<IpBlockRow>(
      `INSERT INTO ip_blocklist (id, ip_address, reason, blocked_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, ipAddress, reason, blockedBy, expiresAt]
    );

    return mapRow(result.rows[0]!);
  }

  async removeBlock(id: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `DELETE FROM ip_blocklist WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows.length > 0;
  }

  async isBlocked(ipAddress: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `SELECT id FROM ip_blocklist
       WHERE ip_address = $1 AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [ipAddress]
    );
    return result.rows.length > 0;
  }

  async listBlocks(page: number, limit: number, includeExpired = false): Promise<{ blocks: IpBlockEntry[]; total: number }> {
    const db = getPool();
    const where = includeExpired ? "" : "WHERE expires_at IS NULL OR expires_at > NOW()";
    const offset = (page - 1) * limit;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ip_blocklist ${where}`
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const result = await db.query<IpBlockRow>(
      `SELECT * FROM ip_blocklist ${where}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { blocks: result.rows.map(mapRow), total };
  }
}
