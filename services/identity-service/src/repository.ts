import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ensureCoreTables, getPool } from "@script-manifest/db";

function generateUnbiasedCode(): number {
  const range = 900000;
  const maxValid = 4294967296 - (4294967296 % range); // reject biased values
  let value: number;
  do {
    value = randomBytes(4).readUInt32BE(0);
  } while (value >= maxValid);
  return (value % range) + 100000;
}

export type IdentityUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  role: string;
  accountStatus: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mfaEnabled: boolean;
};

export type IdentitySession = {
  token: string;
  userId: string;
  expiresAt: string;
};

export type RegisterUserInput = {
  email: string;
  password: string;
  displayName: string;
  acceptTerms?: boolean;
};

export type OAuthStateRecord = {
  codeVerifier: string;
  provider: string;
  redirectUri?: string;
  mockEmail?: string;
  mockDisplayName?: string;
  mockCode?: string;
  expiresAt: string;
};

export type RefreshTokenIssue = {
  refreshToken: string;
  familyId: string;
  expiresAt: string;
};

export type RefreshTokenRotateResult =
  | ({ status: "rotated"; userId: string } & RefreshTokenIssue)
  | { status: "reuse_detected"; familyId: string }
  | { status: "invalid" };

export interface IdentityRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  registerUser(input: RegisterUserInput): Promise<IdentityUser | null>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  createSession(userId: string): Promise<IdentitySession>;
  findUserBySessionToken(token: string): Promise<{ user: IdentityUser; session: IdentitySession } | null>;
  deleteSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  saveOAuthState(state: string, record: OAuthStateRecord): Promise<void>;
  getAndDeleteOAuthState(state: string): Promise<OAuthStateRecord | null>;
  cleanExpiredOAuthState(): Promise<void>;
  createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue>;
  rotateRefreshToken(rawToken: string): Promise<RefreshTokenRotateResult>;
  revokeTokenFamily(familyId: string): Promise<void>;
  revokeUserRefreshTokens?(userId: string): Promise<void>;

  // Email verification
  createEmailVerificationToken(userId: string): Promise<{ code: string }>;
  verifyEmailCode(userId: string, code: string): Promise<boolean>;
  markEmailVerified(userId: string): Promise<void>;

  // Password reset
  createPasswordResetToken(userId: string): Promise<{ token: string }>;
  consumePasswordResetToken(token: string): Promise<{ userId: string } | null>;
  updatePassword(userId: string, password: string): Promise<void>;

  recordFailedLoginAttempt?(userId: string): Promise<{ failedLoginAttempts: number; lockedUntil: string | null }>;
  resetLoginLockout?(userId: string): Promise<void>;
  createAccountUnlockToken?(userId: string): Promise<{ token: string }>;
  consumeAccountUnlockToken?(token: string): Promise<{ userId: string } | null>;

  // Account deletion
  softDeleteUser(userId: string): Promise<void>;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type QueryClient = {
  query<T = Record<string, unknown>>(queryText: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
  release(): void;
};

export function hashPassword(password: string, salt: string): string {
  // Use scrypt with explicit secure parameters: N=16384, r=8, p=1, keylen=64
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const calculated = hashPassword(password, salt);
  const left = Buffer.from(calculated, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PgIdentityRepository implements IdentityRepository {
  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  async init(): Promise<void> {
    await ensureCoreTables();
    const db = getPool();
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'writer';
    `);
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
    `);
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    `);
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
    `);
    await db.query(`
      ALTER TABLE app_users
      ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS account_unlock_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_account_unlock_tokens_hash
      ON account_unlock_tokens(token_hash);
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS oauth_state (
        state TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        provider TEXT NOT NULL,
        redirect_uri TEXT,
        mock_email TEXT,
        mock_display_name TEXT,
        mock_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT UNIQUE NOT NULL,
        family_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    `);
  }

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const db = getPool();
    const client = await db.connect();
    const id = `user_${randomUUID()}`;
    const passwordSalt = randomUUID().replace(/-/g, "");
    const passwordHash = hashPassword(input.password, passwordSalt);

    try {
      await client.query("BEGIN");

      const result = await client.query<{
        id: string;
        email: string;
        display_name: string;
        password_hash: string;
        password_salt: string;
        role: string;
        account_status: string;
        failed_login_attempts: number;
        locked_until: string | null;
      }>(
        `
          INSERT INTO app_users (id, email, display_name, password_hash, password_salt, terms_accepted_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, display_name, password_hash, password_salt, role, account_status, failed_login_attempts, locked_until
        `,
        [id, input.email.toLowerCase(), input.displayName, passwordHash, passwordSalt, input.acceptTerms ? new Date().toISOString() : null]
      );

      const user = result.rows[0];
      if (!user) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
          INSERT INTO writer_profiles (writer_id, display_name)
          VALUES ($1, $2)
          ON CONFLICT (writer_id) DO NOTHING
        `,
        [user.id, user.display_name]
      );

      await client.query("COMMIT");

      return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        passwordHash: user.password_hash,
        passwordSalt: user.password_salt,
        role: user.role,
        accountStatus: user.account_status,
        failedLoginAttempts: user.failed_login_attempts,
        lockedUntil: user.locked_until,
        mfaEnabled: false
      };
    } catch (error) {
      await client.query("ROLLBACK");
      
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      password_salt: string;
      role: string;
      account_status: string;
      failed_login_attempts: number;
      locked_until: string | null;
      mfa_enabled: boolean;
    }>(
      `
        SELECT id, email, display_name, password_hash, password_salt, role, account_status, failed_login_attempts, locked_until, mfa_enabled
        FROM app_users
        WHERE email = $1
      `,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      passwordHash: user.password_hash,
      passwordSalt: user.password_salt,
      role: user.role,
      accountStatus: user.account_status,
      failedLoginAttempts: user.failed_login_attempts,
      lockedUntil: user.locked_until,
      mfaEnabled: user.mfa_enabled
    };
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const db = getPool();
    const token = `sess_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await db.query(
      `
        INSERT INTO app_sessions (token, user_id, expires_at)
        VALUES ($1, $2, $3)
      `,
      [token, userId, expiresAt]
    );

    return { token, userId, expiresAt };
  }

  async findUserBySessionToken(
    token: string
  ): Promise<{ user: IdentityUser; session: IdentitySession } | null> {
    const db = getPool();
    const result = await db.query<{
      token: string;
      user_id: string;
      expires_at: string;
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      password_salt: string;
      role: string;
      account_status: string;
      failed_login_attempts: number;
      locked_until: string | null;
      mfa_enabled: boolean;
    }>(
      `
        SELECT
          s.token,
          s.user_id,
          s.expires_at,
          u.id,
          u.email,
          u.display_name,
          u.password_hash,
          u.password_salt,
          u.role,
          u.account_status,
          u.failed_login_attempts,
          u.locked_until,
          u.mfa_enabled
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.token = $1
      `,
      [token]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await this.deleteSession(token);
      return null;
    }

    return {
      session: {
        token: row.token,
        userId: row.user_id,
        expiresAt: (row.expires_at as unknown) instanceof Date ? (row.expires_at as unknown as Date).toISOString() : String(row.expires_at)
      },
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        role: row.role,
        accountStatus: row.account_status,
        failedLoginAttempts: row.failed_login_attempts,
        lockedUntil: row.locked_until,
        mfaEnabled: row.mfa_enabled
      }
    };
  }

  async deleteSession(token: string): Promise<void> {
    const db = getPool();
    await db.query(`DELETE FROM app_sessions WHERE token = $1`, [token]);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const db = getPool();
    await db.query(`DELETE FROM app_sessions WHERE user_id = $1`, [userId]);
  }

  async saveOAuthState(state: string, record: OAuthStateRecord): Promise<void> {
    const db = getPool();
    await db.query(
      `
        INSERT INTO oauth_state (state, code_verifier, provider, redirect_uri, mock_email, mock_display_name, mock_code, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        state,
        record.codeVerifier,
        record.provider,
        record.redirectUri ?? null,
        record.mockEmail ?? null,
        record.mockDisplayName ?? null,
        record.mockCode ?? null,
        record.expiresAt
      ]
    );
  }

  async getAndDeleteOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const db = getPool();
    const result = await db.query<{
      code_verifier: string;
      provider: string;
      redirect_uri: string | null;
      mock_email: string | null;
      mock_display_name: string | null;
      mock_code: string | null;
      expires_at: string;
    }>(
      `
        DELETE FROM oauth_state
        WHERE state = $1
        RETURNING code_verifier, provider, redirect_uri, mock_email, mock_display_name, mock_code, expires_at
      `,
      [state]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      codeVerifier: row.code_verifier,
      provider: row.provider,
      redirectUri: row.redirect_uri ?? undefined,
      mockEmail: row.mock_email ?? undefined,
      mockDisplayName: row.mock_display_name ?? undefined,
      mockCode: row.mock_code ?? undefined,
      expiresAt: typeof row.expires_at === "string" ? row.expires_at : new Date(row.expires_at as unknown as string).toISOString()
    };
  }

  async cleanExpiredOAuthState(): Promise<void> {
    const db = getPool();
    await db.query(`DELETE FROM oauth_state WHERE expires_at < NOW()`);
  }

  async createRefreshToken(userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const db = getPool();
    const client = await db.connect();

    try {
      return await this.insertRefreshToken(client, userId, familyId);
    } finally {
      client.release();
    }
  }

  async rotateRefreshToken(rawToken: string): Promise<RefreshTokenRotateResult> {
    const db = getPool();
    const client = await db.connect();
    const tokenHash = hashRefreshToken(rawToken);
    let inTransaction = false;

    try {
      const existing = await client.query<{
        id: string;
        family_id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
        revoked_at: string | null;
      }>(
        `
          SELECT id, family_id, user_id, expires_at, used_at, revoked_at
          FROM refresh_tokens
          WHERE token_hash = $1
        `,
        [tokenHash]
      );

      const row = existing.rows[0];
      if (!row) {
        return { status: "invalid" };
      }

      if (row.used_at) {
        return { status: "reuse_detected", familyId: row.family_id };
      }

      if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
        return { status: "invalid" };
      }

      await client.query("BEGIN");
      inTransaction = true;
      const markUsed = await client.query<{ id: string }>(
        `
          UPDATE refresh_tokens
          SET used_at = NOW()
          WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
          RETURNING id
        `,
        [row.id]
      );

      if (markUsed.rows.length === 0) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return { status: "reuse_detected", familyId: row.family_id };
      }

      const replacement = await this.insertRefreshToken(client, row.user_id, row.family_id);
      await client.query("COMMIT");
      inTransaction = false;

      return {
        status: "rotated",
        userId: row.user_id,
        ...replacement,
      };
    } catch (error) {
      if (inTransaction) {
        await client.query("ROLLBACK");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE family_id = $1 AND revoked_at IS NULL
      `,
      [familyId]
    );
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      `,
      [userId]
    );
  }

  async createEmailVerificationToken(userId: string): Promise<{ code: string }> {
    const db = getPool();
    const id = `evt_${randomUUID()}`;
    const code = String(generateUnbiasedCode());
    const tokenHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    // Delete existing tokens for this user
    await db.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);

    await db.query(
      `INSERT INTO email_verification_tokens (id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, tokenHash, userId, expiresAt]
    );

    return { code };
  }

  async verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const db = getPool();
    const tokenHash = createHash("sha256").update(code).digest("hex");

    const result = await db.query<{ id: string }>(
      `DELETE FROM email_verification_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW() RETURNING id`,
      [userId, tokenHash]
    );

    return result.rows.length > 0;
  }

  async markEmailVerified(userId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `UPDATE app_users SET email_verified = true, email_verified_at = NOW() WHERE id = $1`,
      [userId]
    );
  }

  async createPasswordResetToken(userId: string): Promise<{ token: string }> {
    const db = getPool();
    const id = `prt_${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db.query(
      `INSERT INTO password_reset_tokens (id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, tokenHash, userId, expiresAt]
    );

    return { token };
  }

  async consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
    const db = getPool();
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await db.query<{ user_id: string }>(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id`,
      [tokenHash]
    );

    const row = result.rows[0];
    return row ? { userId: row.user_id } : null;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const db = getPool();
    const passwordSalt = randomUUID().replace(/-/g, "");
    const newHash = hashPassword(password, passwordSalt);
    await db.query(
      `UPDATE app_users SET password_hash = $1, password_salt = $2 WHERE id = $3`,
      [newHash, passwordSalt, userId]
    );
  }

  async recordFailedLoginAttempt(userId: string): Promise<{ failedLoginAttempts: number; lockedUntil: string | null }> {
    const db = getPool();
    const result = await db.query<{ failed_login_attempts: number; locked_until: string | null }>(
      `
        UPDATE app_users
        SET
          failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= 15 THEN NULL
            WHEN failed_login_attempts + 1 >= 10 THEN NOW() + INTERVAL '1 hour'
            WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
            ELSE locked_until
          END
        WHERE id = $1
        RETURNING failed_login_attempts, locked_until
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return { failedLoginAttempts: 0, lockedUntil: null };
    }

    return {
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until,
    };
  }

  async resetLoginLockout(userId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `UPDATE app_users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
      [userId]
    );
  }

  async createAccountUnlockToken(userId: string): Promise<{ token: string }> {
    const db = getPool();
    const id = `aut_${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.query(`DELETE FROM account_unlock_tokens WHERE user_id = $1`, [userId]);
    await db.query(
      `INSERT INTO account_unlock_tokens (id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, tokenHash, userId, expiresAt]
    );

    return { token };
  }

  async consumeAccountUnlockToken(token: string): Promise<{ userId: string } | null> {
    const db = getPool();
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await db.query<{ user_id: string }>(
      `UPDATE account_unlock_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING user_id`,
      [tokenHash]
    );

    const row = result.rows[0];
    return row ? { userId: row.user_id } : null;
  }

  async softDeleteUser(userId: string): Promise<void> {
    const db = getPool();
    await db.query(
      `UPDATE app_users SET account_status = 'deleted' WHERE id = $1`,
      [userId]
    );
    // Invalidate all sessions and tokens
    await this.deleteUserSessions(userId);
    await this.revokeUserRefreshTokens(userId);
  }

  private async insertRefreshToken(client: QueryClient, userId: string, familyId?: string): Promise<RefreshTokenIssue> {
    const refreshToken = `rfr_${randomBytes(48).toString("base64url")}`;
    const tokenHash = hashRefreshToken(refreshToken);
    const finalFamilyId = familyId ?? `fam_${randomUUID()}`;
    const id = `rt_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await client.query(
      `
        INSERT INTO refresh_tokens (id, token_hash, family_id, user_id, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [id, tokenHash, finalFamilyId, userId, expiresAt]
    );

    return { refreshToken, familyId: finalFamilyId, expiresAt };
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string };
  return e?.code === "23505";
}
