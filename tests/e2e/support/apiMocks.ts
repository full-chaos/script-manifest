import type { Page, Route } from "@playwright/test";
import { TEST_USER } from "./session";

type MutableProfile = {
  id: string;
  displayName: string;
  bio: string;
  genres: string[];
  demographics: string[];
  representationStatus: "represented" | "unrepresented" | "seeking_rep";
  headshotUrl: string;
  customProfileUrl: string;
  isSearchable: boolean;
};

type MutableProject = {
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

function nowIso(): string {
  return "2026-02-22T00:00:00.000Z";
}

function jsonReply(route: Route, status: number, payload: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

export async function mockAuthEndpoints(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/register", async (route) =>
    jsonReply(route, 201, {
      token: "sess_e2e_auth",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: TEST_USER
    })
  );

  await page.route("**/api/v1/auth/login", async (route) =>
    jsonReply(route, 200, {
      token: "sess_e2e_auth",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: TEST_USER
    })
  );

  await page.route("**/api/v1/auth/logout", async (route) =>
    route.fulfill({ status: 204, body: "" })
  );
}

export async function mockProfileAndProjectEndpoints(page: Page): Promise<void> {
  const profile: MutableProfile = {
    id: TEST_USER.id,
    displayName: TEST_USER.displayName,
    bio: "Feature writer with a focus on grounded thrillers.",
    genres: ["Drama", "Thriller"],
    demographics: [],
    representationStatus: "seeking_rep",
    headshotUrl: "",
    customProfileUrl: "script-manifest/e2e",
    isSearchable: true
  };

  const projects: MutableProject[] = [
    {
      id: "project_e2e_01",
      ownerUserId: TEST_USER.id,
      title: "Existing Integration Project",
      logline: "A stable project for UI regression coverage.",
      synopsis: "Used to validate project dashboard rendering in Playwright.",
      format: "feature",
      genre: "drama",
      pageCount: 102,
      isDiscoverable: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    const path = url.pathname;

    if (path === `/api/v1/profiles/${encodeURIComponent(TEST_USER.id)}` && method === "GET") {
      return jsonReply(route, 200, { profile });
    }

    if (path === `/api/v1/profiles/${encodeURIComponent(TEST_USER.id)}` && method === "PUT") {
      const body = request.postDataJSON() as Partial<MutableProfile>;
      Object.assign(profile, body);
      return jsonReply(route, 200, { profile });
    }

    if (path === "/api/v1/projects" && method === "GET") {
      const ownerUserId = url.searchParams.get("ownerUserId");
      const filtered = ownerUserId
        ? projects.filter((project) => project.ownerUserId === ownerUserId)
        : projects;
      return jsonReply(route, 200, { projects: filtered });
    }

    if (path === "/api/v1/projects" && method === "POST") {
      const body = request.postDataJSON() as Partial<MutableProject>;
      const created: MutableProject = {
        id: `project_e2e_${String(projects.length + 1).padStart(2, "0")}`,
        ownerUserId: TEST_USER.id,
        title: body.title ?? "Untitled",
        logline: body.logline ?? "",
        synopsis: body.synopsis ?? "",
        format: body.format ?? "feature",
        genre: body.genre ?? "drama",
        pageCount: Number(body.pageCount ?? 0),
        isDiscoverable: Boolean(body.isDiscoverable),
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      projects.unshift(created);
      return jsonReply(route, 201, { project: created });
    }

    if (/^\/api\/v1\/projects\/[^/]+\/co-writers$/.test(path) && method === "GET") {
      return jsonReply(route, 200, { coWriters: [] });
    }

    if (/^\/api\/v1\/projects\/[^/]+\/drafts$/.test(path) && method === "GET") {
      return jsonReply(route, 200, { drafts: [] });
    }

    if (/^\/api\/v1\/scripts\/[^/]+\/access-requests$/.test(path) && method === "GET") {
      return jsonReply(route, 200, { accessRequests: [] });
    }

    if (path === "/api/v1/competitions" && method === "GET") {
      return jsonReply(route, 200, { competitions: [] });
    }

    return jsonReply(route, 404, { error: "mock_not_configured", path, method });
  });
}
