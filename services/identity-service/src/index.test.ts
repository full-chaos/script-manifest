import assert from "node:assert/strict";
import test from "node:test";
import type {
  IdentityRepository,
  IdentitySession,
  IdentityUser,
  RegisterUserInput
} from "./repository.js";
import { buildServer } from "./index.js";
import { hashPassword } from "./repository.js";

class MemoryRepo implements IdentityRepository {
  private users = new Map<string, IdentityUser>();
  private usersByEmail = new Map<string, string>();
  private sessions = new Map<string, IdentitySession>();

  async init(): Promise<void> {}

  async registerUser(input: RegisterUserInput): Promise<IdentityUser | null> {
    const email = input.email.toLowerCase();
    if (this.usersByEmail.has(email)) {
      return null;
    }

    const id = `user_${this.users.size + 1}`;
    const passwordSalt = `salt_${this.users.size + 1}`;
    const user: IdentityUser = {
      id,
      email,
      displayName: input.displayName,
      passwordSalt,
      passwordHash: hashPassword(input.password, passwordSalt)
    };
    this.users.set(id, user);
    this.usersByEmail.set(email, id);
    return user;
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const userId = this.usersByEmail.get(email.toLowerCase());
    return userId ? (this.users.get(userId) ?? null) : null;
  }

  async createSession(userId: string): Promise<IdentitySession> {
    const token = `sess_${this.sessions.size + 1}`;
    const session: IdentitySession = {
      token,
      userId,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    this.sessions.set(token, session);
    return session;
  }

  async findUserBySessionToken(
    token: string
  ): Promise<{ user: IdentityUser; session: IdentitySession } | null> {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user) {
      return null;
    }

    return { user, session };
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }
}

test("identity register/login/me/logout flow", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const register = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "writer@example.com",
      password: "password123",
      displayName: "Writer One"
    }
  });
  assert.equal(register.statusCode, 201);
  const registerPayload = register.json();
  assert.ok(registerPayload.token);

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "writer@example.com",
      password: "password123"
    }
  });
  assert.equal(login.statusCode, 200);
  const token = login.json().token as string;

  const me = await server.inject({
    method: "GET",
    url: "/internal/auth/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(me.statusCode, 200);

  const logout = await server.inject({
    method: "POST",
    url: "/internal/auth/logout",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(logout.statusCode, 204);
});
