import { getPool } from "@script-manifest/db";
import type { ScriptFileRegistration, ScriptVisibility } from "@script-manifest/contracts";

export type ScriptRecord = ScriptFileRegistration & {
  visibility: ScriptVisibility;
  approvedViewers: string[];
};

export interface ScriptStorageRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  registerScript(record: ScriptRecord): Promise<void>;
  getScript(scriptId: string): Promise<ScriptRecord | null>;
  updateVisibility(scriptId: string, visibility: ScriptVisibility): Promise<void>;
  addApprovedViewer(scriptId: string, viewerId: string): Promise<void>;
  listScripts(): Promise<ScriptRecord[]>;
}

// ── PostgreSQL implementation ─────────────────────────────────────────────

export class PgScriptStorageRepository implements ScriptStorageRepository {
  async init(): Promise<void> {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        object_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER,
        visibility TEXT NOT NULL DEFAULT 'private',
        approved_viewers TEXT[] NOT NULL DEFAULT '{}',
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_scripts_owner ON scripts(owner_user_id);
    `);
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  async registerScript(record: ScriptRecord): Promise<void> {
    await getPool().query(
      `INSERT INTO scripts (id, owner_user_id, object_key, filename, content_type, size_bytes, visibility, approved_viewers, registered_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         owner_user_id = $2, object_key = $3, filename = $4, content_type = $5,
         size_bytes = $6, visibility = $7, approved_viewers = $8, registered_at = $9, updated_at = NOW()`,
      [
        record.scriptId,
        record.ownerUserId,
        record.objectKey,
        record.filename,
        record.contentType,
        record.size,
        record.visibility,
        record.approvedViewers,
        record.registeredAt
      ]
    );
  }

  async getScript(scriptId: string): Promise<ScriptRecord | null> {
    const { rows } = await getPool().query(
      "SELECT * FROM scripts WHERE id = $1",
      [scriptId]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async updateVisibility(scriptId: string, visibility: ScriptVisibility): Promise<void> {
    await getPool().query(
      "UPDATE scripts SET visibility = $2, updated_at = NOW() WHERE id = $1",
      [scriptId, visibility]
    );
  }

  async addApprovedViewer(scriptId: string, viewerId: string): Promise<void> {
    await getPool().query(
      `UPDATE scripts
       SET approved_viewers = array_append(approved_viewers, $2),
           visibility = CASE WHEN visibility = 'private' THEN 'approved_only' ELSE visibility END,
           updated_at = NOW()
       WHERE id = $1 AND NOT ($2 = ANY(approved_viewers))`,
      [scriptId, viewerId]
    );
    // If the viewer was already in the list (no rows updated), also ensure visibility is upgraded
    await getPool().query(
      `UPDATE scripts
       SET visibility = 'approved_only', updated_at = NOW()
       WHERE id = $1 AND visibility = 'private' AND $2 = ANY(approved_viewers)`,
      [scriptId, viewerId]
    );
  }

  async listScripts(): Promise<ScriptRecord[]> {
    const { rows } = await getPool().query(
      "SELECT * FROM scripts ORDER BY registered_at DESC"
    );
    return rows.map(mapRow);
  }
}

// ── In-memory implementation (for tests) ─────────────────────────────────

export class MemoryScriptStorageRepository implements ScriptStorageRepository {
  private scripts = new Map<string, ScriptRecord>();

  constructor(initial?: ScriptRecord[]) {
    for (const record of initial ?? []) {
      this.scripts.set(record.scriptId, record);
    }
  }

  async init(): Promise<void> {
    // no-op
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async registerScript(record: ScriptRecord): Promise<void> {
    this.scripts.set(record.scriptId, { ...record });
  }

  async getScript(scriptId: string): Promise<ScriptRecord | null> {
    return this.scripts.get(scriptId) ?? null;
  }

  async updateVisibility(scriptId: string, visibility: ScriptVisibility): Promise<void> {
    const record = this.scripts.get(scriptId);
    if (record) {
      record.visibility = visibility;
    }
  }

  async addApprovedViewer(scriptId: string, viewerId: string): Promise<void> {
    const record = this.scripts.get(scriptId);
    if (!record) return;
    if (!record.approvedViewers.includes(viewerId)) {
      record.approvedViewers.push(viewerId);
    }
    if (record.visibility === "private") {
      record.visibility = "approved_only";
    }
  }

  async listScripts(): Promise<ScriptRecord[]> {
    return Array.from(this.scripts.values());
  }
}

// ── Row mapper ────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ScriptRecord {
  return {
    scriptId: row.id as string,
    ownerUserId: row.owner_user_id as string,
    objectKey: row.object_key as string,
    filename: row.filename as string,
    contentType: row.content_type as string,
    size: Number(row.size_bytes),
    registeredAt: (row.registered_at as Date).toISOString(),
    visibility: row.visibility as ScriptVisibility,
    approvedViewers: (row.approved_viewers as string[]) ?? []
  };
}
