import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import { BaseMemoryRepository } from "@script-manifest/service-utils";
import { encryptSecret, decryptSecret } from "./crypto-helpers.js";

export type MfaStatus = {
  enabled: boolean;
  enabledAt: string | null;
};

export interface MfaRepository {
  init(): Promise<void>;
  setupMfa(userId: string, secret: string): Promise<void>;
  getPendingSetup(userId: string): Promise<string | null>;
  enableMfa(userId: string, backupCodes: string[]): Promise<void>;
  disableMfa(userId: string): Promise<void>;
  getMfaStatus(userId: string): Promise<MfaStatus>;
  getSecret(userId: string): Promise<string | null>;
  getBackupCodes(userId: string): Promise<string[]>;
  consumeBackupCode(userId: string, codeHash: string): Promise<boolean>;
  /** Store a short-lived MFA login challenge token (5 min TTL). Returns the token. */
  storeMfaChallenge(token: string, userId: string, expiresAt: number): Promise<void>;
  /** Consume (single-use) an MFA challenge token. Returns userId or null if invalid/expired. */
  consumeMfaChallenge(token: string): Promise<string | null>;
}

// ── In-memory implementation for tests ────────────────────────────────

type MfaRecord = {
  userId: string;
  secret: string;
  enabled: boolean;
  enabledAt: string | null;
  backupCodes: string[]; // hashed
};

type MfaChallengeRecord = {
  userId: string;
  expiresAt: number;
};

export class MemoryMfaRepository extends BaseMemoryRepository implements MfaRepository {
  private records = new Map<string, MfaRecord>();
  private challenges = new Map<string, MfaChallengeRecord>();

  override async init(): Promise<void> {
    // No-op for in-memory implementation
  }

  async setupMfa(userId: string, secret: string): Promise<void> {
    this.records.set(userId, {
      userId,
      secret,
      enabled: false,
      enabledAt: null,
      backupCodes: []
    });
  }

  async getPendingSetup(userId: string): Promise<string | null> {
    const record = this.records.get(userId);
    if (!record || record.enabled) return null;
    return record.secret;
  }

  async enableMfa(userId: string, backupCodes: string[]): Promise<void> {
    const record = this.records.get(userId);
    if (!record) return;
    record.enabled = true;
    record.enabledAt = new Date().toISOString();
    record.backupCodes = backupCodes;
  }

  async disableMfa(userId: string): Promise<void> {
    this.records.delete(userId);
  }

  async getMfaStatus(userId: string): Promise<MfaStatus> {
    const record = this.records.get(userId);
    if (!record) return { enabled: false, enabledAt: null };
    return { enabled: record.enabled, enabledAt: record.enabledAt };
  }

  async getSecret(userId: string): Promise<string | null> {
    const record = this.records.get(userId);
    return record?.secret ?? null;
  }

  async getBackupCodes(userId: string): Promise<string[]> {
    const record = this.records.get(userId);
    return record?.backupCodes ?? [];
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const record = this.records.get(userId);
    if (!record) return false;
    const index = record.backupCodes.indexOf(codeHash);
    if (index === -1) return false;
    record.backupCodes.splice(index, 1);
    return true;
  }

  async storeMfaChallenge(token: string, userId: string, expiresAt: number): Promise<void> {
    this.challenges.set(token, { userId, expiresAt });
  }

  async consumeMfaChallenge(token: string): Promise<string | null> {
    const challenge = this.challenges.get(token);
    if (!challenge) return null;
    this.challenges.delete(token);
    if (challenge.expiresAt <= Date.now()) return null;
    return challenge.userId;
  }
}

// ── PostgreSQL implementation ─────────────────────────────────────────

export class PgMfaRepository implements MfaRepository {
  async init(): Promise<void> {
    const db = getPool();
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_mfa (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        totp_secret TEXT NOT NULL,
        enabled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_mfa_backup_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user
      ON user_mfa_backup_codes(user_id);
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS mfa_login_challenges (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires
      ON mfa_login_challenges(expires_at);
    `);
  }

  async setupMfa(userId: string, secret: string): Promise<void> {
    const db = getPool();
    const id = `mfa_${randomUUID()}`;
    const encryptedSecret = encryptSecret(secret);
    // Upsert: replace any existing pending setup
    await db.query(
      `
        INSERT INTO user_mfa (id, user_id, totp_secret)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET totp_secret = $3, enabled_at = NULL
      `,
      [id, userId, encryptedSecret]
    );
  }

  async getPendingSetup(userId: string): Promise<string | null> {
    const db = getPool();
    const result = await db.query<{ totp_secret: string }>(
      `SELECT totp_secret FROM user_mfa WHERE user_id = $1 AND enabled_at IS NULL`,
      [userId]
    );
    const raw = result.rows[0]?.totp_secret;
    if (raw == null) return null;
    return decryptSecret(raw);
  }

  async enableMfa(userId: string, backupCodes: string[]): Promise<void> {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Mark MFA as enabled in user_mfa table
      await client.query(
        `UPDATE user_mfa SET enabled_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      // Set mfa_enabled on app_users
      await client.query(
        `UPDATE app_users SET mfa_enabled = true WHERE id = $1`,
        [userId]
      );

      // Delete any existing backup codes
      await client.query(
        `DELETE FROM user_mfa_backup_codes WHERE user_id = $1`,
        [userId]
      );

      // Insert new backup codes (already hashed)
      for (const codeHash of backupCodes) {
        const id = `mbc_${randomUUID()}`;
        await client.query(
          `INSERT INTO user_mfa_backup_codes (id, user_id, code_hash) VALUES ($1, $2, $3)`,
          [id, userId, codeHash]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async disableMfa(userId: string): Promise<void> {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM user_mfa_backup_codes WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_mfa WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE app_users SET mfa_enabled = false WHERE id = $1`, [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getMfaStatus(userId: string): Promise<MfaStatus> {
    const db = getPool();
    const result = await db.query<{ mfa_enabled: boolean; enabled_at: Date | string | null }>(
      `
        SELECT u.mfa_enabled, m.enabled_at
        FROM app_users u
        LEFT JOIN user_mfa m ON m.user_id = u.id
        WHERE u.id = $1
      `,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return { enabled: false, enabledAt: null };
    const enabledAt = row.enabled_at instanceof Date
      ? row.enabled_at.toISOString()
      : row.enabled_at ? String(row.enabled_at) : null;
    return { enabled: row.mfa_enabled, enabledAt };
  }

  async getSecret(userId: string): Promise<string | null> {
    const db = getPool();
    const result = await db.query<{ totp_secret: string }>(
      `SELECT totp_secret FROM user_mfa WHERE user_id = $1`,
      [userId]
    );
    const raw = result.rows[0]?.totp_secret;
    if (raw == null) return null;
    return decryptSecret(raw);
  }

  async getBackupCodes(userId: string): Promise<string[]> {
    const db = getPool();
    const result = await db.query<{ code_hash: string }>(
      `SELECT code_hash FROM user_mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    return result.rows.map((r: { code_hash: string }) => r.code_hash);
  }

  async consumeBackupCode(userId: string, codeHash: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `
        UPDATE user_mfa_backup_codes
        SET used_at = NOW()
        WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
        RETURNING id
      `,
      [userId, codeHash]
    );
    return result.rows.length > 0;
  }

  async storeMfaChallenge(token: string, userId: string, expiresAt: number): Promise<void> {
    const db = getPool();
    const expiresAtDate = new Date(expiresAt);
    // Purge expired challenges as a lightweight housekeeping step
    await db.query(`DELETE FROM mfa_login_challenges WHERE expires_at < NOW()`);
    await db.query(
      `INSERT INTO mfa_login_challenges (token, user_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO NOTHING`,
      [token, userId, expiresAtDate]
    );
  }

  async consumeMfaChallenge(token: string): Promise<string | null> {
    const db = getPool();
    const result = await db.query<{ user_id: string }>(
      `DELETE FROM mfa_login_challenges
       WHERE token = $1 AND expires_at > NOW()
       RETURNING user_id`,
      [token]
    );
    return result.rows[0]?.user_id ?? null;
  }
}
