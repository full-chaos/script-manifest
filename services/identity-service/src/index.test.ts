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

test("identity register rejects duplicate email", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const payload = {
    email: "writer@example.com",
    password: "password123",
    displayName: "Writer One"
  };

  const first = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload
  });
  assert.equal(first.statusCode, 201);

  const second = await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "email_already_registered");
});

test("identity login rejects invalid credentials", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/auth/register",
    payload: {
      email: "writer@example.com",
      password: "password123",
      displayName: "Writer One"
    }
  });

  const login = await server.inject({
    method: "POST",
    url: "/internal/auth/login",
    payload: {
      email: "writer@example.com",
      password: "wrong-password"
    }
  });

  assert.equal(login.statusCode, 401);
  assert.equal(login.json().error, "invalid_credentials");
});

test("identity me/logout require bearer token", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const me = await server.inject({
    method: "GET",
    url: "/internal/auth/me"
  });
  assert.equal(me.statusCode, 401);
  assert.equal(me.json().error, "missing_bearer_token");

  const logout = await server.inject({
    method: "POST",
    url: "/internal/auth/logout"
  });
  assert.equal(logout.statusCode, 401);
  assert.equal(logout.json().error, "missing_bearer_token");
});

test("identity oauth start/complete issues session and enforces one-time state", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const start = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/github/start",
    payload: { loginHint: "Writer Two" }
  });
  assert.equal(start.statusCode, 201);
  const startPayload = start.json();
  assert.equal(startPayload.provider, "github");
  assert.match(startPayload.authorizationUrl as string, /state=/);
  assert.match(startPayload.authorizationUrl as string, /code=/);

  const complete = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/github/complete",
    payload: {
      state: startPayload.state,
      code: startPayload.mockCode
    }
  });
  assert.equal(complete.statusCode, 200);
  assert.ok(complete.json().token);
  assert.match(complete.json().user.email as string, /^github\+writer-two@oauth\.local$/);

  const replay = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/github/complete",
    payload: {
      state: startPayload.state,
      code: startPayload.mockCode
    }
  });
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.json().error, "invalid_oauth_state");
});

test("identity oauth callback validates code", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepo() });
  t.after(async () => {
    await server.close();
  });

  const start = await server.inject({
    method: "POST",
    url: "/internal/auth/oauth/github/start"
  });
  assert.equal(start.statusCode, 201);
  const startPayload = start.json();

  const callback = await server.inject({
    method: "GET",
    url: `/internal/auth/oauth/github/callback?state=${encodeURIComponent(startPayload.state as string)}&code=${"1".repeat(32)}`
  });
  assert.equal(callback.statusCode, 400);
  assert.equal(callback.json().error, "invalid_oauth_code");
});
