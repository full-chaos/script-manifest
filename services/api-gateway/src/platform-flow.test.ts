import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildServer } from "./index.js";
import { request } from "undici";

type RequestResult = Awaited<ReturnType<typeof request>>;

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  password: string;
};

type SessionRecord = {
  token: string;
  userId: string;
  expiresAt: string;
};

type ProjectRecord = {
  id: string;
  ownerUserId: string;
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  pageCount: number;
  isDiscoverable: boolean;
  createdAt: string;
  updatedAt: string;
};

type SubmissionRecord = {
  id: string;
  writerId: string;
  projectId: string;
  competitionId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

function buildPlatformRequestFn() {
  const usersByEmail = new Map<string, UserRecord>();
  const usersById = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const profiles = new Map<string, { id: string; displayName: string; bio: string; genres: string[]; representationStatus: string }>();
  const projects = new Map<string, ProjectRecord>();
  const submissions = new Map<string, SubmissionRecord>();

  return (async (rawUrl, options) => {
    const url = new URL(String(rawUrl));
    const method = String(options?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const rawBody = options?.body ? String(options.body) : "";
    const body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const headers = (options?.headers as Record<string, string> | undefined) ?? {};
    const auth = headers.authorization;

    if (url.origin === "http://identity-svc") {
      if (path === "/internal/auth/register" && method === "POST") {
        const email = String(body.email ?? "").toLowerCase();
        if (usersByEmail.has(email)) {
          return jsonResponse({ error: "email_already_registered" }, 409);
        }

        const user: UserRecord = {
          id: `user_${randomUUID()}`,
          email,
          displayName: String(body.displayName ?? ""),
          password: String(body.password ?? "")
        };
        usersByEmail.set(email, user);
        usersById.set(user.id, user);
        profiles.set(user.id, {
          id: user.id,
          displayName: user.displayName,
          bio: "",
          genres: [],
          representationStatus: "unrepresented"
        });

        const session: SessionRecord = {
          token: `sess_${randomUUID()}`,
          userId: user.id,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        };
        sessions.set(session.token, session);
        return jsonResponse(
          {
            token: session.token,
            expiresAt: session.expiresAt,
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName
            }
          },
          201
        );
      }

      if (path === "/internal/auth/login" && method === "POST") {
        const email = String(body.email ?? "").toLowerCase();
        const user = usersByEmail.get(email);
        if (!user || user.password !== String(body.password ?? "")) {
          return jsonResponse({ error: "invalid_credentials" }, 401);
        }
        const session: SessionRecord = {
          token: `sess_${randomUUID()}`,
          userId: user.id,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        };
        sessions.set(session.token, session);
        return jsonResponse({
          token: session.token,
          expiresAt: session.expiresAt,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName
          }
        });
      }

      if (path === "/internal/auth/me" && method === "GET") {
        const token = auth?.replace(/^Bearer /, "") ?? "";
        const session = sessions.get(token);
        if (!session) {
          return jsonResponse({ error: "invalid_session" }, 401);
        }
        const user = usersById.get(session.userId);
        if (!user) {
          return jsonResponse({ error: "invalid_session" }, 401);
        }
        return jsonResponse({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName
          },
          expiresAt: session.expiresAt
        });
      }
    }

    if (url.origin === "http://profile-svc") {
      if (path.startsWith("/internal/profiles/") && method === "GET") {
        const writerId = decodeURIComponent(path.replace("/internal/profiles/", ""));
        const profile = profiles.get(writerId);
        if (!profile) {
          return jsonResponse({ error: "profile_not_found" }, 404);
        }
        return jsonResponse({ profile });
      }

      if (path.startsWith("/internal/profiles/") && method === "PUT") {
        const writerId = decodeURIComponent(path.replace("/internal/profiles/", ""));
        const profile = profiles.get(writerId);
        if (!profile) {
          return jsonResponse({ error: "profile_not_found" }, 404);
        }
        const next = {
          ...profile,
          ...body
        };
        profiles.set(writerId, next);
        return jsonResponse({ profile: next });
      }

      if (path === "/internal/projects" && method === "POST") {
        const ownerUserId = String(headers["x-auth-user-id"] ?? "");
        if (!usersById.has(ownerUserId)) {
          return jsonResponse({ error: "owner_not_found" }, 404);
        }
        const now = new Date().toISOString();
        const project: ProjectRecord = {
          id: `project_${randomUUID()}`,
          ownerUserId,
          title: String(body.title ?? ""),
          logline: String(body.logline ?? ""),
          synopsis: String(body.synopsis ?? ""),
          format: String(body.format ?? ""),
          genre: String(body.genre ?? ""),
          pageCount: Number(body.pageCount ?? 0),
          isDiscoverable: Boolean(body.isDiscoverable),
          createdAt: now,
          updatedAt: now
        };
        projects.set(project.id, project);
        return jsonResponse({ project }, 201);
      }

      if (path === "/internal/projects" && method === "GET") {
        const ownerUserId = url.searchParams.get("ownerUserId");
        const projectList = Array.from(projects.values()).filter((project) => {
          if (!ownerUserId) {
            return true;
          }
          return project.ownerUserId === ownerUserId;
        });
        return jsonResponse({ projects: projectList });
      }
    }

    if (url.origin === "http://submission-svc") {
      if (path === "/internal/submissions" && method === "POST") {
        const now = new Date().toISOString();
        const submission: SubmissionRecord = {
          id: `submission_${randomUUID()}`,
          writerId: String(headers["x-auth-user-id"] ?? ""),
          projectId: String(body.projectId ?? ""),
          competitionId: String(body.competitionId ?? ""),
          status: String(body.status ?? "pending"),
          createdAt: now,
          updatedAt: now
        };
        submissions.set(submission.id, submission);
        return jsonResponse({ submission }, 201);
      }

      if (path === "/internal/submissions" && method === "GET") {
        const writerId = url.searchParams.get("writerId");
        const rows = Array.from(submissions.values()).filter((submission) => {
          if (!writerId) {
            return true;
          }
          return submission.writerId === writerId;
        });
        return jsonResponse({ submissions: rows });
      }
    }

    return jsonResponse({ error: "route_not_found" }, 404);
  }) as typeof request;
}

test("platform flow through api gateway: auth + profile + project + submissions", async (t) => {
  const server = await buildServer({
    logger: false,
    requestFn: buildPlatformRequestFn(),
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const register = await server.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "writer@example.com",
      password: "password123",
      displayName: "Writer One"
    }
  });
  assert.equal(register.statusCode, 201);
  const session = register.json();
  const token = session.token as string;
  const writerId = session.user.id as string;

  const me = await server.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.id, writerId);

  const authHeaders = { authorization: `Bearer ${token}` };

  const updateProfile = await server.inject({
    method: "PUT",
    url: `/api/v1/profiles/${writerId}`,
    headers: authHeaders,
    payload: {
      bio: "Updated profile",
      genres: ["Drama", "Thriller"],
      representationStatus: "seeking_rep"
    }
  });
  assert.equal(updateProfile.statusCode, 200);
  assert.equal(updateProfile.json().profile.representationStatus, "seeking_rep");

  const createProject = await server.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders,
    payload: {
      title: "My Script",
      logline: "A writer keeps shipping",
      synopsis: "",
      format: "feature",
      genre: "drama",
      pageCount: 110,
      isDiscoverable: true
    }
  });
  assert.equal(createProject.statusCode, 201);
  const projectId = createProject.json().project.id as string;

  const listProjects = await server.inject({
    method: "GET",
    url: `/api/v1/projects?ownerUserId=${encodeURIComponent(writerId)}`
  });
  assert.equal(listProjects.statusCode, 200);
  assert.equal(listProjects.json().projects.length, 1);

  const createSubmission = await server.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: authHeaders,
    payload: {
      projectId,
      competitionId: "comp_001",
      status: "pending"
    }
  });
  assert.equal(createSubmission.statusCode, 201);

  const listSubmissions = await server.inject({
    method: "GET",
    url: `/api/v1/submissions?writerId=${encodeURIComponent(writerId)}`
  });
  assert.equal(listSubmissions.statusCode, 200);
  assert.equal(listSubmissions.json().submissions.length, 1);
});
