import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { ensureCoreTables, getPool } from "@script-manifest/db";

export type IdentityUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
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

export interface IdentityRepository {
  init(): Promise<void>;
  registerUser(input: RegisterUserInput): Promise<IdentityUser | null>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  createSession(userId: string): Promise<IdentitySession>;
  findUserBySessionToken(token: string): Promise<{ user: IdentityUser; session: IdentitySession } | null>;
  deleteSession(token: string): Promise<void>;
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const calculated = hashPassword(password, salt);
  const left = Buffer.from(calculated, "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PgIdentityRepository implements IdentityRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
  }

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const db = getPool();
    const id = `user_${randomUUID()}`;
    const passwordSalt = randomUUID().replace(/-/g, "");
    const passwordHash = hashPassword(input.password, passwordSalt);

    try {
      const result = await db.query<{
        id: string;
        email: string;
        display_name: string;
        password_hash: string;
        password_salt: string;
      }>(
        `
          INSERT INTO app_users (id, email, display_name, password_hash, password_salt)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, email, display_name, password_hash, password_salt
        `,
        [id, input.email.toLowerCase(), input.displayName, passwordHash, passwordSalt]
      );

      const user = result.rows[0];
      if (!user) {
        return null;
      }

      await db.query(
        `
          INSERT INTO writer_profiles (writer_id, display_name)
          VALUES ($1, $2)
          ON CONFLICT (writer_id) DO NOTHING
        `,
        [user.id, user.display_name]
      );

      return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        passwordHash: user.password_hash,
        passwordSalt: user.password_salt
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }

      throw error;
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
    }>(
      `
        SELECT id, email, display_name, password_hash, password_salt
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
      passwordSalt: user.password_salt
    };
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const db = getPool();
    const token = `sess_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
          u.password_salt
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
        passwordSalt: row.password_salt
      }
    };
  }

  async deleteSession(token: string): Promise<void> {
    const db = getPool();
    await db.query(`DELETE FROM app_sessions WHERE token = $1`, [token]);
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string };
  return e?.code === "23505";
}
