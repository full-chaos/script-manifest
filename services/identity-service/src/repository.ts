import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ensureCoreTables, getPool } from "@script-manifest/db";

export type IdentityUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  role: string;
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

export interface IdentityRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  registerUser(input: RegisterUserInput): Promise<IdentityUser | null>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  createSession(userId: string): Promise<IdentitySession>;
  findUserBySessionToken(token: string): Promise<{ user: IdentityUser; session: IdentitySession } | null>;
  deleteSession(token: string): Promise<void>;
  saveOAuthState(state: string, record: OAuthStateRecord): Promise<void>;
  getAndDeleteOAuthState(state: string): Promise<OAuthStateRecord | null>;
  cleanExpiredOAuthState(): Promise<void>;
}

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
      }>(
        `
          INSERT INTO app_users (id, email, display_name, password_hash, password_salt)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, email, display_name, password_hash, password_salt, role
        `,
        [id, input.email.toLowerCase(), input.displayName, passwordHash, passwordSalt]
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
        role: user.role
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
    }>(
      `
        SELECT id, email, display_name, password_hash, password_salt, role
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
      role: user.role
    };
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const db = getPool();
    const token = `sess_${randomUUID()}`;
    // Configurable session duration in days (default: 7 days)
    const sessionDurationDays = parseInt(process.env.SESSION_DURATION_DAYS ?? "7", 10);
    if (!Number.isFinite(sessionDurationDays) || sessionDurationDays <= 0) {
      throw new Error("SESSION_DURATION_DAYS must be a positive integer");
    }
    const expiresAt = new Date(Date.now() + sessionDurationDays * 24 * 60 * 60 * 1000).toISOString();

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
          u.role
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
        expiresAt: row.expires_at
      },
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        role: row.role
      }
    };
  }

  async deleteSession(token: string): Promise<void> {
    const db = getPool();
    await db.query(`DELETE FROM app_sessions WHERE token = $1`, [token]);
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
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string };
  return e?.code === "23505";
}
