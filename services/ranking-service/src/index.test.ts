import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type {
  AntiGamingFlag,
  AntiGamingFlagReason,
  AntiGamingFlagStatus,
  CompetitionPrestige,
  NotificationEventEnvelope,
  PrestigeTier,
  RankedLeaderboardFilters,
  RankedWriterEntry,
  RankingAppeal,
  RankingAppealStatus,
  TierDesignation,
  WriterBadge
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { RankingRepository, WriterScoreRow, PlacementScoreRow } from "./repository.js";
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

// ── MemoryRankingRepository ─────────────────────────────────────────

class MemoryRankingRepository implements RankingRepository {
  prestige = new Map<string, CompetitionPrestige>();
  writerScores = new Map<string, WriterScoreRow>();
  placementScores: PlacementScoreRow[] = [];
  badges: WriterBadge[] = [];
  snapshots: Array<{ writerId: string; totalScore: number; date: string }> = [];
  flags: AntiGamingFlag[] = [];
  appeals: RankingAppeal[] = [];
  private nextId = 1;

  private id(prefix: string) { return `${prefix}_${String(this.nextId++)}`; }

  async init() {}
  async healthCheck() { return { database: true }; }

  // Prestige
  async getPrestige(competitionId: string) { return this.prestige.get(competitionId) ?? null; }
  async upsertPrestige(competitionId: string, tier: PrestigeTier, multiplier: number) {
    const p: CompetitionPrestige = { competitionId, tier, multiplier, updatedAt: new Date().toISOString() };
    this.prestige.set(competitionId, p);
    return p;
  }
  async listPrestige() { return [...this.prestige.values()]; }

  // Writer scores
  async getWriterScore(writerId: string) { return this.writerScores.get(writerId) ?? null; }
  async upsertWriterScore(row: WriterScoreRow) { this.writerScores.set(row.writerId, row); }
  async bulkUpsertWriterScores(rows: WriterScoreRow[]) { for (const r of rows) this.writerScores.set(r.writerId, r); }
  async listLeaderboard(filters: RankedLeaderboardFilters, allowedWriterIds: Set<string> | null) {
    let entries = [...this.writerScores.values()].filter((s) => s.totalScore > 0);
    if (filters.tier) entries = entries.filter((s) => s.tier === filters.tier);
    if (allowedWriterIds) entries = entries.filter((s) => allowedWriterIds.has(s.writerId));
    entries.sort((a, b) =>
      filters.trending ? (b.scoreChange30d - a.scoreChange30d) : ((a.rank ?? 999) - (b.rank ?? 999))
    );
    const total = entries.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    const sliced = entries.slice(offset, offset + limit);
    const result: RankedWriterEntry[] = sliced.map((s) => ({
      writerId: s.writerId, rank: s.rank ?? 0, totalScore: s.totalScore,
      submissionCount: s.submissionCount, placementCount: s.placementCount,
      tier: s.tier, badges: this.badges.filter((b) => b.writerId === s.writerId).map((b) => b.label),
      scoreChange30d: s.scoreChange30d, lastUpdatedAt: s.lastUpdatedAt
    }));
    return { entries: result, total };
  }
  async getTotalRankedWriters() { return [...this.writerScores.values()].filter((s) => s.totalScore > 0).length; }

  // Placement scores
  async upsertPlacementScore(row: PlacementScoreRow) {
    this.placementScores = this.placementScores.filter((p) => p.placementId !== row.placementId);
    this.placementScores.push(row);
  }
  async bulkUpsertPlacementScores(rows: PlacementScoreRow[]) { for (const r of rows) await this.upsertPlacementScore(r); }
  async getPlacementScores(writerId: string) { return this.placementScores.filter((p) => p.writerId === writerId); }
  async clearPlacementScores() { this.placementScores = []; }

  // Badges
  async awardBadge(writerId: string, label: string, placementId: string, competitionId: string) {
    const existing = this.badges.find((b) => b.placementId === placementId);
    if (existing) return existing;
    const badge: WriterBadge = { id: this.id("badge"), writerId, label, placementId, competitionId, awardedAt: new Date().toISOString() };
    this.badges.push(badge);
    return badge;
  }
  async getBadges(writerId: string) { return this.badges.filter((b) => b.writerId === writerId); }
  async hasBadge(placementId: string) { return this.badges.some((b) => b.placementId === placementId); }

  // Snapshots
  async createSnapshot(writerId: string, totalScore: number) {
    this.snapshots.push({ writerId, totalScore, date: new Date().toISOString().slice(0, 10) });
  }
  async bulkCreateSnapshots(rows: Array<{ writerId: string; totalScore: number }>) {
    for (const r of rows) await this.createSnapshot(r.writerId, r.totalScore);
  }
  async getSnapshotScore(_writerId: string, _daysAgo: number) { return null; }

  // Anti-gaming
  async createFlag(writerId: string, reason: AntiGamingFlagReason, details: string) {
    const flag: AntiGamingFlag = { id: this.id("flag"), writerId, reason, details, status: "open", resolvedByUserId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.flags.push(flag);
    return flag;
  }
  async getFlag(flagId: string) { return this.flags.find((f) => f.id === flagId) ?? null; }
  async listFlags(status?: AntiGamingFlagStatus) { return status ? this.flags.filter((f) => f.status === status) : this.flags; }
  async resolveFlag(flagId: string, resolvedByUserId: string, status: "dismissed" | "confirmed") {
    const f = this.flags.find((fl) => fl.id === flagId);
    if (!f) return null;
    f.status = status;
    f.resolvedByUserId = resolvedByUserId;
    return f;
  }

  // Appeals
  async createAppeal(writerId: string, reason: string) {
    const appeal: RankingAppeal = { id: this.id("appeal"), writerId, reason, status: "open", resolutionNote: null, resolvedByUserId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.appeals.push(appeal);
    return appeal;
  }
  async getAppeal(appealId: string) { return this.appeals.find((a) => a.id === appealId) ?? null; }
  async listAppeals(status?: RankingAppealStatus) { return status ? this.appeals.filter((a) => a.status === status) : this.appeals; }
  async resolveAppeal(appealId: string, resolvedByUserId: string, status: "upheld" | "rejected", resolutionNote: string) {
    const a = this.appeals.find((ap) => ap.id === appealId);
    if (!a) return null;
    a.status = status;
    a.resolvedByUserId = resolvedByUserId;
    a.resolutionNote = resolutionNote;
    return a;
  }
}

// ── Helper to build test server ─────────────────────────────────────

function createTestServer(overrides?: { requestFn?: typeof request; repository?: MemoryRankingRepository }) {
  const repo = overrides?.repository ?? new MemoryRankingRepository();
  const events: NotificationEventEnvelope[] = [];
  const server = buildServer({
    logger: false,
    repository: repo,
    publisher: async (event) => { events.push(event); },
    requestFn: overrides?.requestFn ?? (async () => jsonResponse({})) as typeof request,
    submissionTrackingBase: "http://submission-svc",
    competitionDirectoryBase: "http://competition-svc",
    profileServiceBase: "http://profile-svc"
  });
  return { server, repo, events };
}

// ── Tests ───────────────────────────────────────────────────────────

test("health endpoint returns ok", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().ok, true);
});

test("empty leaderboard returns no entries", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/internal/leaderboard" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.leaderboard, []);
});

test("methodology endpoint returns scoring constants", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/internal/methodology" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.version, "1.0.0");
  assert.equal(body.statusWeights.winner, 10);
  assert.equal(body.prestigeMultipliers.premier, 3.0);
  assert.equal(body.timeDecayHalfLifeDays, 365);
});

test("prestige upsert requires auth", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "PUT",
    url: "/internal/prestige/comp_1",
    payload: { tier: "elite", multiplier: 2.0 }
  });
  assert.equal(res.statusCode, 403);
});

test("prestige upsert stores and retrieves config", async (t) => {
  const { server, repo } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "PUT",
    url: "/internal/prestige/comp_1",
    headers: { "x-auth-user-id": "admin_01" },
    payload: { tier: "elite", multiplier: 2.0 }
  });
  assert.equal(res.statusCode, 200);

  const getRes = await server.inject({ method: "GET", url: "/internal/prestige/comp_1" });
  assert.equal(getRes.statusCode, 200);
  const config = getRes.json().prestige;
  assert.equal(config.tier, "elite");
  assert.equal(config.multiplier, 2);
});

test("full recompute flow computes scores and assigns ranks", async (t) => {
  const now = new Date().toISOString();
  const requestFn = (async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/internal/placements")) {
      return jsonResponse({
        placements: [
          { id: "pl_1", submissionId: "sub_1", status: "finalist", verificationState: "verified", verifiedAt: now, writerId: "w1", projectId: "p1", competitionId: "c1", createdAt: now, updatedAt: now },
          { id: "pl_2", submissionId: "sub_2", status: "quarterfinalist", verificationState: "verified", verifiedAt: now, writerId: "w2", projectId: "p2", competitionId: "c1", createdAt: now, updatedAt: now }
        ]
      });
    }
    if (urlStr.includes("/internal/submissions")) {
      return jsonResponse({
        submissions: [
          { id: "sub_1", writerId: "w1", competitionId: "c1", projectId: "p1", status: "finalist", createdAt: now, updatedAt: now },
          { id: "sub_2", writerId: "w2", competitionId: "c1", projectId: "p2", status: "quarterfinalist", createdAt: now, updatedAt: now }
        ]
      });
    }
    if (urlStr.includes("/internal/competitions")) {
      return jsonResponse({
        competitions: [
          { id: "c1", title: "Austin Film Festival", description: "A great fest", format: "feature", genre: "drama", feeUsd: 0, deadline: "2026-06-01T00:00:00.000Z" }
        ]
      });
    }
    return jsonResponse({});
  }) as typeof request;

  const { server, repo } = createTestServer({ requestFn });
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/recompute",
    headers: { "x-auth-user-id": "admin_01" }
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.writerCount, 2);
  assert.equal(body.placementCount, 2);
  assert.ok(body.badgesAwarded >= 2, `expected >=2 badges, got ${body.badgesAwarded}`);

  // Check leaderboard has ranked entries
  const lbRes = await server.inject({ method: "GET", url: "/internal/leaderboard" });
  const lb = lbRes.json();
  assert.equal(lb.total, 2);
  assert.equal(lb.leaderboard[0].rank, 1);
  assert.ok(lb.leaderboard[0].totalScore > lb.leaderboard[1].totalScore);

  // Check writer score endpoint
  const w1Res = await server.inject({ method: "GET", url: "/internal/writers/w1/score" });
  assert.equal(w1Res.statusCode, 200);
  const w1 = w1Res.json();
  assert.equal(w1.writerId, "w1");
  assert.ok(w1.totalScore > 0);
  assert.ok(w1.badges.length > 0);

  // Check badges endpoint
  const badgeRes = await server.inject({ method: "GET", url: "/internal/writers/w1/badges" });
  assert.equal(badgeRes.statusCode, 200);
  assert.ok(badgeRes.json().badges.length > 0);
});

test("leaderboard tier filter works", async (t) => {
  const repo = new MemoryRankingRepository();
  await repo.upsertWriterScore({ writerId: "w1", totalScore: 100, submissionCount: 5, placementCount: 3, rank: 1, tier: "top_1", scoreChange30d: 10, lastUpdatedAt: new Date().toISOString() });
  await repo.upsertWriterScore({ writerId: "w2", totalScore: 50, submissionCount: 3, placementCount: 1, rank: 5, tier: "top_10", scoreChange30d: 2, lastUpdatedAt: new Date().toISOString() });

  const { server } = createTestServer({ repository: repo });
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/internal/leaderboard?tier=top_1" });
  const body = res.json();
  assert.equal(body.total, 1);
  assert.equal(body.leaderboard[0].writerId, "w1");
});

test("leaderboard trending sort works", async (t) => {
  const repo = new MemoryRankingRepository();
  await repo.upsertWriterScore({ writerId: "w1", totalScore: 100, submissionCount: 5, placementCount: 3, rank: 1, tier: "top_1", scoreChange30d: 2, lastUpdatedAt: new Date().toISOString() });
  await repo.upsertWriterScore({ writerId: "w2", totalScore: 50, submissionCount: 3, placementCount: 1, rank: 2, tier: "top_10", scoreChange30d: 20, lastUpdatedAt: new Date().toISOString() });

  const { server } = createTestServer({ repository: repo });
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/internal/leaderboard?trending=true" });
  const body = res.json();
  assert.equal(body.leaderboard[0].writerId, "w2"); // w2 has higher scoreChange30d
});

test("appeal creation and resolution", async (t) => {
  const { server, events } = createTestServer();
  t.after(() => server.close());

  // Create appeal
  const createRes = await server.inject({
    method: "POST",
    url: "/internal/appeals",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { reason: "I believe my score is incorrect" }
  });
  assert.equal(createRes.statusCode, 201);
  const appeal = createRes.json().appeal;
  assert.equal(appeal.status, "open");
  assert.equal(appeal.writerId, "writer_01");

  // List appeals
  const listRes = await server.inject({ method: "GET", url: "/internal/appeals" });
  assert.equal(listRes.json().appeals.length, 1);

  // Resolve appeal
  const resolveRes = await server.inject({
    method: "POST",
    url: `/internal/appeals/${appeal.id}/resolve`,
    headers: { "x-auth-user-id": "admin_01" },
    payload: { status: "upheld", resolutionNote: "Score corrected" }
  });
  assert.equal(resolveRes.statusCode, 200);
  assert.equal(resolveRes.json().appeal.status, "upheld");

  // Notification sent
  assert.equal(events.length, 1);
  assert.equal(events[0]!.eventType, "ranking_appeal_resolved");
});

test("appeal creation requires auth", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/appeals",
    payload: { reason: "test" }
  });
  assert.equal(res.statusCode, 403);
});

test("writer score returns 404 for unknown writer", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({ method: "GET", url: "/internal/writers/unknown/score" });
  assert.equal(res.statusCode, 404);
});

test("anti-gaming flag resolve", async (t) => {
  const repo = new MemoryRankingRepository();
  const flag = await repo.createFlag("w1", "duplicate_submission", "test details");
  const { server } = createTestServer({ repository: repo });
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: `/internal/flags/${flag.id}/resolve`,
    headers: { "x-auth-user-id": "admin_01" },
    payload: { status: "dismissed" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().flag.status, "dismissed");
});

test("incremental recompute returns 202", async (t) => {
  const { server } = createTestServer();
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/recompute/incremental",
    payload: { writerId: "w1" }
  });
  assert.equal(res.statusCode, 202);
});

test("maintenance snapshot creates snapshots", async (t) => {
  const repo = new MemoryRankingRepository();
  await repo.upsertWriterScore({ writerId: "w1", totalScore: 50, submissionCount: 2, placementCount: 1, rank: 1, tier: "top_1", scoreChange30d: 5, lastUpdatedAt: new Date().toISOString() });
  const { server } = createTestServer({ repository: repo });
  t.after(() => server.close());

  const res = await server.inject({ method: "POST", url: "/internal/maintenance/snapshot" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().snapshotsCreated, 1);
  assert.equal(repo.snapshots.length, 1);
});

test("duplicate submissions create anti-gaming flags during recompute", async (t) => {
  const now = new Date().toISOString();
  const requestFn = (async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/internal/submissions")) {
      return jsonResponse({
        submissions: [
          { id: "sub_1", writerId: "w1", competitionId: "c1", projectId: "p1", status: "pending", createdAt: now, updatedAt: now },
          { id: "sub_2", writerId: "w1", competitionId: "c1", projectId: "p2", status: "pending", createdAt: now, updatedAt: now }
        ]
      });
    }
    if (urlStr.includes("/internal/placements")) {
      return jsonResponse({ placements: [] });
    }
    if (urlStr.includes("/internal/competitions")) {
      return jsonResponse({ competitions: [] });
    }
    return jsonResponse({});
  }) as typeof request;

  const { server, repo } = createTestServer({ requestFn });
  t.after(() => server.close());

  const res = await server.inject({
    method: "POST",
    url: "/internal/recompute",
    headers: { "x-auth-user-id": "admin_01" }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().flagsCreated, 1);
  assert.equal(repo.flags.length, 1);
  assert.equal(repo.flags[0]!.reason, "duplicate_submission");
});
