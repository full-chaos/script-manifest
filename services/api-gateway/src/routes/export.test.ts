import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../index.js";
import { request } from "undici";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

const mockProfile = {
  profile: {
    displayName: "Writer One",
    email: "writer@example.com",
    bio: "My bio",
    genres: ["drama", "comedy"],
    representationStatus: "seeking_rep"
  }
};

const mockProjects = {
  projects: [
    {
      id: "proj_001",
      title: "My Script",
      format: "feature",
      genre: "drama",
      pageCount: 110,
      logline: "A logline",
      createdAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z"
    }
  ]
};

const mockSubmissions = {
  submissions: [
    {
      id: "sub_001",
      projectId: "proj_001",
      competitionId: "comp_001",
      status: "semifinalist",
      createdAt: "2026-01-20T00:00:00.000Z",
      updatedAt: "2026-01-20T00:00:00.000Z"
    }
  ]
};

const mockPlacements = {
  placements: [
    {
      id: "place_001",
      submissionId: "sub_001",
      status: "semifinalist",
      verificationState: "verified",
      createdAt: "2026-01-25T00:00:00.000Z",
      updatedAt: "2026-01-25T00:00:00.000Z"
    }
  ]
};

function buildMockRequestFn() {
  return (async (url: string | URL) => {
    const urlStr = String(url);

    if (urlStr.includes("/internal/auth/me")) {
      return jsonResponse({
        user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
        expiresAt: "2026-12-31T00:00:00.000Z"
      });
    }

    if (urlStr.includes("/internal/profiles/")) {
      return jsonResponse(mockProfile);
    }

    if (urlStr.includes("/internal/projects")) {
      return jsonResponse(mockProjects);
    }

    if (urlStr.includes("/internal/submissions")) {
      return jsonResponse(mockSubmissions);
    }

    if (urlStr.includes("/internal/placements")) {
      return jsonResponse(mockPlacements);
    }

    return jsonResponse({ error: "unexpected_url" }, 404);
  }) as typeof request;
}

test("export/csv returns 401 when not authenticated", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async () => {
      return jsonResponse({ error: "unauthorized" }, 401);
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/csv"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");
});

test("export/zip returns 401 when not authenticated", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async () => {
      return jsonResponse({ error: "unauthorized" }, 401);
    }) as typeof request,
    identityServiceBase: "http://identity-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/zip"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");
});

test("export/csv returns CSV with expected headers and data", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: buildMockRequestFn(),
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/csv",
    headers: { authorization: "Bearer sess_test" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/csv");
  assert.match(
    response.headers["content-disposition"] as string,
    /script-manifest-export\.csv/
  );

  const body = response.body;

  // Profile section
  assert.match(body, /# Profile/);
  assert.match(body, /display_name,email,bio,genres,representation_status/);
  assert.match(body, /"Writer One"/);
  assert.match(body, /"writer@example\.com"/);
  assert.match(body, /"drama,comedy"/);

  // Projects section
  assert.match(body, /# Projects/);
  assert.match(body, /id,title,format,genre,page_count,logline,created_at,updated_at/);
  assert.match(body, /"proj_001"/);
  assert.match(body, /"My Script"/);

  // Submissions section
  assert.match(body, /# Submissions/);
  assert.match(body, /id,project_id,competition_id,status,created_at,updated_at/);
  assert.match(body, /"sub_001"/);

  // Placements section
  assert.match(body, /# Placements/);
  assert.match(body, /id,submission_id,status,verification_state,created_at,updated_at/);
  assert.match(body, /"place_001"/);
  assert.match(body, /"verified"/);
});

test("export/csv escapes double quotes in values", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: (async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      if (urlStr.includes("/internal/profiles/")) {
        return jsonResponse({
          profile: {
            displayName: 'Writer "The Great" One',
            email: "writer@example.com",
            bio: 'A "great" bio',
            genres: ["drama"],
            representationStatus: "unrepresented"
          }
        });
      }
      if (urlStr.includes("/internal/projects")) {
        return jsonResponse({ projects: [] });
      }
      if (urlStr.includes("/internal/submissions")) {
        return jsonResponse({ submissions: [] });
      }
      if (urlStr.includes("/internal/placements")) {
        return jsonResponse({ placements: [] });
      }
      return jsonResponse({}, 404);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/csv",
    headers: { authorization: "Bearer sess_test" }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"Writer ""The Great"" One"/);
  assert.match(response.body, /"A ""great"" bio"/);
});

test("export/zip returns a ZIP archive with correct content type", async (t) => {
  const server = buildServer({
    logger: false,
    requestFn: buildMockRequestFn(),
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/zip",
    headers: { authorization: "Bearer sess_test" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/zip");
  assert.match(
    response.headers["content-disposition"] as string,
    /script-manifest-export\.zip/
  );

  // ZIP files start with the PK magic bytes (0x50 0x4B)
  const raw = response.rawPayload;
  assert.equal(raw[0], 0x50);
  assert.equal(raw[1], 0x4b);
});

test("export/csv fetches data for the authenticated user", async (t) => {
  const fetchedUrls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url: string | URL) => {
      const urlStr = String(url);
      fetchedUrls.push(urlStr);

      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_42", email: "w@example.com", displayName: "Writer 42" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      if (urlStr.includes("/internal/profiles/")) {
        return jsonResponse({ profile: null });
      }
      if (urlStr.includes("/internal/projects")) {
        return jsonResponse({ projects: [] });
      }
      if (urlStr.includes("/internal/submissions")) {
        return jsonResponse({ submissions: [] });
      }
      if (urlStr.includes("/internal/placements")) {
        return jsonResponse({ placements: [] });
      }
      return jsonResponse({}, 404);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc",
    submissionTrackingBase: "http://submission-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/export/csv",
    headers: { authorization: "Bearer sess_test" }
  });

  assert.equal(response.statusCode, 200);

  // Verify user-specific URLs were called
  assert.ok(fetchedUrls.some((u) => u.includes("/internal/profiles/writer_42")));
  assert.ok(fetchedUrls.some((u) => u.includes("/internal/projects?ownerUserId=writer_42")));
  assert.ok(fetchedUrls.some((u) => u.includes("/internal/submissions?writerId=writer_42")));
});
