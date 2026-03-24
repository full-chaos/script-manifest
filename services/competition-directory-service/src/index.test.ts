import assert from "node:assert/strict";
import test from "node:test";
import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility } from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { CompetitionDirectoryRepository } from "./repository.js";
import { request } from "undici";

type RequestResult = Awaited<ReturnType<typeof request>>;

function textResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      text: async () => JSON.stringify(payload),
      json: async () => payload
    }
  } as RequestResult;
}

class MemoryCompetitionDirectoryRepository implements CompetitionDirectoryRepository {
  private readonly competitions = new Map<string, Competition>();

  constructor() {
    this.competitions.set("comp_001", {
      id: "comp_001",
      title: "Screenplay Sprint",
      description: "Seed competition record for local development",
      format: "feature",
      genre: "drama",
      feeUsd: 25,
      deadline: "2026-05-01T23:59:59Z",
      status: "active",
      visibility: "listed",
      accessType: "open"
    });
  }

  async init(): Promise<void> {
    return;
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async upsertCompetition(competition: Competition): Promise<{ existed: boolean }> {
    const existed = this.competitions.has(competition.id);
    this.competitions.set(competition.id, competition);
    return { existed };
  }

  async getCompetition(id: string): Promise<Competition | null> {
    return this.competitions.get(id) ?? null;
  }

  async listCompetitions(filters: CompetitionFilters): Promise<Competition[]> {
    const loweredQuery = filters.query?.toLowerCase();
    return Array.from(this.competitions.values()).filter((competition) => {
      if (
        loweredQuery &&
        !`${competition.title} ${competition.description}`.toLowerCase().includes(loweredQuery)
      ) {
        return false;
      }

      if (filters.format && competition.format.toLowerCase() !== filters.format.toLowerCase()) {
        return false;
      }

      if (filters.genre && competition.genre.toLowerCase() !== filters.genre.toLowerCase()) {
        return false;
      }

      if (typeof filters.maxFeeUsd === "number" && competition.feeUsd > filters.maxFeeUsd) {
        return false;
      }

      if (filters.deadlineBefore && new Date(competition.deadline) >= filters.deadlineBefore) {
        return false;
      }

      return true;
    });
  }

  async getAllCompetitions(): Promise<Competition[]> {
    return Array.from(this.competitions.values());
  }

  async cancelCompetition(id: string): Promise<Competition | null> {
    const comp = this.competitions.get(id);
    if (!comp || comp.status === "cancelled") return null;
    const updated = { ...comp, status: "cancelled" as const };
    this.competitions.set(id, updated);
    return updated;
  }

  async updateVisibility(id: string, visibility: CompetitionVisibility): Promise<Competition | null> {
    const comp = this.competitions.get(id);
    if (!comp) return null;
    const updated = { ...comp, visibility };
    this.competitions.set(id, updated);
    return updated;
  }

  async updateAccessType(id: string, accessType: CompetitionAccessType): Promise<Competition | null> {
    const comp = this.competitions.get(id);
    if (!comp) return null;
    const updated = { ...comp, accessType };
    this.competitions.set(id, updated);
    return updated;
  }
}

test("competition directory filters seeded competitions", async (t) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryCompetitionDirectoryRepository(),
    requestFn: (async () => textResponse({})) as typeof request,
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/internal/competitions?genre=drama" });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.competitions.length, 1);
});

test("competition directory upsert indexes competition", async (t) => {
  const calls: string[] = [];
  const server = buildServer({
    logger: false,
    repository: new MemoryCompetitionDirectoryRepository(),
    requestFn: (async (url) => {
      calls.push(String(url));
      return textResponse({ result: "ok" }, 201);
    }) as typeof request
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/competitions",
    payload: {
      id: "comp_200",
      title: "Pilot Lab",
      description: "TV contest",
      format: "tv",
      genre: "drama",
      feeUsd: 55,
      deadline: "2026-09-01T00:00:00Z"
    }
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.indexed, true);
  assert.match(calls[0] ?? "", /\/internal\/index\/competition$/);
});

test("competition deadline reminder publishes notification event", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    repository: new MemoryCompetitionDirectoryRepository(),
    requestFn: (async (url) => {
      urls.push(String(url));
      return textResponse({ accepted: true }, 202);
    }) as typeof request,
    notificationServiceBase: "http://notification-service"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/competitions/comp_001/deadline-reminders",
    payload: {
      targetUserId: "writer_01",
      deadlineAt: "2026-05-01T23:59:59Z"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.match(urls[0] ?? "", /notification-service\/internal\/events$/);
});

test("competition admin curation route enforces allowlist header", async (t) => {
  process.env.COMPETITION_ADMIN_ALLOWLIST = "admin_writer";

  const server = buildServer({
    logger: false,
    repository: new MemoryCompetitionDirectoryRepository(),
    requestFn: (async () => textResponse({ ok: true }, 201)) as typeof request
  });
  t.after(async () => {
    delete process.env.COMPETITION_ADMIN_ALLOWLIST;
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/internal/admin/competitions",
    payload: {
      id: "comp_admin_1",
      title: "Admin Curated",
      description: "Secured route",
      format: "feature",
      genre: "thriller",
      feeUsd: 10,
      deadline: "2026-08-01T00:00:00Z"
    }
  });
  assert.equal(forbidden.statusCode, 403);

  const allowed = await server.inject({
    method: "POST",
    url: "/internal/admin/competitions",
    headers: { "x-admin-user-id": "admin_writer" },
    payload: {
      id: "comp_admin_1",
      title: "Admin Curated",
      description: "Secured route",
      format: "feature",
      genre: "thriller",
      feeUsd: 10,
      deadline: "2026-08-01T00:00:00Z"
    }
  });
  assert.equal(allowed.statusCode, 201);
});
