import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CompetitionPrestigeUpsertRequestSchema,
  RankedLeaderboardFiltersSchema,
  RankingAppealCreateRequestSchema,
  RankingAppealResolveRequestSchema,
  type Submission,
  type PlacementListItem,
  type Competition,
  SubmissionSchema,
  PlacementListItemSchema,
  CompetitionSchema
} from "@script-manifest/contracts";
import { publishNotificationEvent } from "./notificationPublisher.js";
import {
  type RankingRepository,
  type WriterScoreRow,
  PgRankingRepository
} from "./repository.js";
import {
  STATUS_WEIGHTS,
  DEFAULT_PRESTIGE_MULTIPLIERS,
  TIME_DECAY_HALF_LIFE_DAYS,
  CONFIDENCE_THRESHOLD,
  TIER_THRESHOLDS,
  computePlacementScore,
  computeVerificationMultiplier,
  computeTimeDecay,
  computeConfidenceFactor,
  assignTier,
  generateBadgeLabel,
  detectDuplicateSubmissions
} from "./scoring.js";
import { request as undiciRequest } from "undici";
import { z } from "zod";

type RequestFn = typeof undiciRequest;
type PublishNotificationEvent = typeof publishNotificationEvent;

export type RankingServiceOptions = {
  logger?: boolean;
  repository?: RankingRepository;
  publisher?: PublishNotificationEvent;
  requestFn?: RequestFn;
  submissionTrackingBase?: string;
  competitionDirectoryBase?: string;
  profileServiceBase?: string;
};

export function buildServer(options: RankingServiceOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id"
  });

  const repo = options.repository ?? new PgRankingRepository();
  const publisher = options.publisher ?? publishNotificationEvent;
  const httpRequest = options.requestFn ?? undiciRequest;
  const submissionTrackingBase = options.submissionTrackingBase ?? process.env.SUBMISSION_TRACKING_SERVICE_URL ?? "http://localhost:4004";
  const competitionDirectoryBase = options.competitionDirectoryBase ?? process.env.COMPETITION_DIRECTORY_SERVICE_URL ?? "http://localhost:4002";
  const profileServiceBase = options.profileServiceBase ?? process.env.PROFILE_SERVICE_URL ?? "http://localhost:4001";

  // ── Health ──

  server.get("/health", async () => {
    const health = await repo.healthCheck();
    return { service: "ranking-service", ok: health.database, database: health.database };
  });
  server.get("/health/live", async () => ({ ok: true }));
  server.get("/health/ready", async () => {
    const health = await repo.healthCheck();
    return { service: "ranking-service", ok: health.database };
  });

  // ── Leaderboard ──

  server.get("/internal/leaderboard", async (req, reply) => {
    const parsed = RankedLeaderboardFiltersSchema.safeParse(req.query);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_query" });
    const filters = parsed.data;

    let allowedWriterIds: Set<string> | null = null;

    if (filters.format || filters.genre) {
      const params = new URLSearchParams();
      if (filters.format) params.set("format", filters.format);
      if (filters.genre) params.set("genre", filters.genre);
      params.set("limit", "1000");
      params.set("offset", "0");
      try {
        const res = await httpRequest(`${profileServiceBase}/internal/projects?${params.toString()}`, { method: "GET" });
        const body = await res.body.json() as { projects?: Array<{ ownerUserId: string }> };
        allowedWriterIds = new Set((body.projects ?? []).map((p) => p.ownerUserId));
      } catch {
        allowedWriterIds = new Set();
      }
    }

    const result = await repo.listLeaderboard(filters, allowedWriterIds);
    return { leaderboard: result.entries, total: result.total };
  });

  // ── Writer score + badges ──

  server.get("/internal/writers/:writerId/score", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const score = await repo.getWriterScore(writerId);
    if (!score) return reply.status(404).send({ error: "writer_not_found" });
    const badges = await repo.getBadges(writerId);
    return {
      writerId: score.writerId,
      rank: score.rank ?? 0,
      totalScore: score.totalScore,
      submissionCount: score.submissionCount,
      placementCount: score.placementCount,
      tier: score.tier,
      badges: badges.map((b) => b.label),
      scoreChange30d: score.scoreChange30d,
      lastUpdatedAt: score.lastUpdatedAt
    };
  });

  server.get("/internal/writers/:writerId/badges", async (req) => {
    const { writerId } = req.params as { writerId: string };
    const badges = await repo.getBadges(writerId);
    return { badges };
  });

  // ── Methodology ──

  server.get("/internal/methodology", async () => ({
    statusWeights: STATUS_WEIGHTS,
    prestigeMultipliers: DEFAULT_PRESTIGE_MULTIPLIERS,
    timeDecayHalfLifeDays: TIME_DECAY_HALF_LIFE_DAYS,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    tierThresholds: TIER_THRESHOLDS,
    version: "1.0.0"
  }));

  // ── Prestige ──

  server.get("/internal/prestige", async () => {
    const configs = await repo.listPrestige();
    return { prestige: configs };
  });

  server.get("/internal/prestige/:competitionId", async (req, reply) => {
    const { competitionId } = req.params as { competitionId: string };
    const config = await repo.getPrestige(competitionId);
    if (!config) return reply.status(404).send({ error: "not_found" });
    return { prestige: config };
  });

  server.put("/internal/prestige/:competitionId", async (req, reply) => {
    const userId = req.headers["x-auth-user-id"] as string | undefined;
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const { competitionId } = req.params as { competitionId: string };
    const parsed = CompetitionPrestigeUpsertRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const config = await repo.upsertPrestige(competitionId, parsed.data.tier, parsed.data.multiplier);
    return { prestige: config };
  });

  // ── Recompute ──

  server.post("/internal/recompute", async (req, reply) => {
    const now = new Date().toISOString();

    // 1. Fetch all submissions
    let submissions: Submission[] = [];
    try {
      const res = await httpRequest(`${submissionTrackingBase}/internal/submissions`, { method: "GET" });
      const body = await res.body.json() as { submissions?: unknown[] };
      submissions = (body.submissions ?? []).map((s) => SubmissionSchema.parse(s));
    } catch (err) {
      return reply.status(502).send({ error: "submissions_unavailable" });
    }

    // 2. Fetch all placements (internal — no auth)
    let placements: PlacementListItem[] = [];
    try {
      const res = await httpRequest(`${submissionTrackingBase}/internal/placements`, { method: "GET" });
      const body = await res.body.json() as { placements?: unknown[] };
      placements = (body.placements ?? []).map((p) => PlacementListItemSchema.parse(p));
    } catch (err) {
      return reply.status(502).send({ error: "placements_unavailable" });
    }

    // 3. Fetch competitions
    let competitions: Competition[] = [];
    try {
      const res = await httpRequest(`${competitionDirectoryBase}/internal/competitions`, { method: "GET" });
      const body = await res.body.json() as { competitions?: unknown[] };
      competitions = (body.competitions ?? []).map((c) => CompetitionSchema.parse(c));
    } catch {
      // Non-fatal — competitions may be empty
    }
    const competitionMap = new Map(competitions.map((c) => [c.id, c]));

    // 4. Load prestige configs
    const prestigeConfigs = await repo.listPrestige();
    const prestigeMap = new Map(prestigeConfigs.map((p) => [p.competitionId, p.multiplier]));

    // 5. Build submission lookup
    const submissionMap = new Map(submissions.map((s) => [s.id, s]));

    // 6. Compute individual placement scores
    await repo.clearPlacementScores();
    const writerData = new Map<string, { totalScore: number; submissionIds: Set<string>; placementCount: number; lastUpdated: string }>();

    // Track submissions per writer for counts
    for (const sub of submissions) {
      if (!writerData.has(sub.writerId)) {
        writerData.set(sub.writerId, { totalScore: 0, submissionIds: new Set(), placementCount: 0, lastUpdated: sub.updatedAt });
      }
      writerData.get(sub.writerId)!.submissionIds.add(sub.id);
      if (sub.updatedAt > writerData.get(sub.writerId)!.lastUpdated) {
        writerData.get(sub.writerId)!.lastUpdated = sub.updatedAt;
      }
    }

    let badgesAwarded = 0;
    for (const placement of placements) {
      const submission = submissionMap.get(placement.submissionId);
      if (!submission) continue;

      const prestigeMultiplier = prestigeMap.get(submission.competitionId) ?? 1.0;
      const evaluationCount = writerData.get(submission.writerId)?.placementCount ?? 0;
      const rawScore = computePlacementScore({
        status: placement.status,
        prestigeMultiplier,
        verificationState: placement.verificationState,
        placementDate: placement.createdAt,
        now,
        evaluationCount: evaluationCount + 1
      });

      await repo.upsertPlacementScore({
        placementId: placement.id,
        writerId: submission.writerId,
        competitionId: submission.competitionId,
        projectId: submission.projectId,
        statusWeight: STATUS_WEIGHTS[placement.status] ?? 0,
        prestigeMultiplier,
        verificationMultiplier: computeVerificationMultiplier(placement.verificationState),
        timeDecayFactor: computeTimeDecay(placement.createdAt, now),
        confidenceFactor: computeConfidenceFactor(evaluationCount + 1),
        rawScore,
        placementDate: placement.createdAt
      });

      if (!writerData.has(submission.writerId)) {
        writerData.set(submission.writerId, { totalScore: 0, submissionIds: new Set(), placementCount: 0, lastUpdated: submission.updatedAt });
      }
      const wd = writerData.get(submission.writerId)!;
      wd.totalScore += rawScore;
      wd.placementCount += 1;
      if (placement.updatedAt > wd.lastUpdated) wd.lastUpdated = placement.updatedAt;

      // Award badges for verified quarterfinalist+
      if (
        placement.verificationState === "verified" &&
        placement.status !== "pending" &&
        !(await repo.hasBadge(placement.id))
      ) {
        const comp = competitionMap.get(submission.competitionId);
        const title = comp?.title ?? submission.competitionId;
        const year = new Date(placement.createdAt).getFullYear();
        const label = generateBadgeLabel(placement.status, title, year);
        if (label) {
          await repo.awardBadge(submission.writerId, label, placement.id, submission.competitionId);
          badgesAwarded++;
        }
      }
    }

    // 7. Assign ranks and tiers
    const sortedWriters = [...writerData.entries()]
      .map(([writerId, data]) => ({ writerId, ...data }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const totalWriters = sortedWriters.length;
    const scoreRows: WriterScoreRow[] = sortedWriters.map((w, i) => ({
      writerId: w.writerId,
      totalScore: Math.round(w.totalScore * 100) / 100,
      submissionCount: w.submissionIds.size,
      placementCount: w.placementCount,
      rank: i + 1,
      tier: assignTier(i + 1, totalWriters),
      scoreChange30d: 0,
      lastUpdatedAt: w.lastUpdated
    }));

    // 8. Compute 30-day deltas
    for (const row of scoreRows) {
      const oldScore = await repo.getSnapshotScore(row.writerId, 30);
      if (oldScore !== null) {
        row.scoreChange30d = Math.round((row.totalScore - oldScore) * 100) / 100;
      }
    }

    await repo.bulkUpsertWriterScores(scoreRows);

    // 9. Duplicate submission detection
    const dupes = detectDuplicateSubmissions(
      submissions.map((s) => ({ writerId: s.writerId, competitionId: s.competitionId, projectId: s.projectId }))
    );
    let flagsCreated = 0;
    for (const dupe of dupes) {
      await repo.createFlag(
        dupe.writerId,
        "duplicate_submission",
        `Writer submitted ${dupe.duplicateProjectIds.length} projects to competition ${dupe.competitionId}: ${dupe.duplicateProjectIds.join(", ")}`
      );
      flagsCreated++;
    }

    return {
      recomputedAt: now,
      writerCount: totalWriters,
      placementCount: placements.length,
      badgesAwarded,
      flagsCreated
    };
  });

  // ── Incremental recompute ──

  server.post("/internal/recompute/incremental", async (req, reply) => {
    const body = z.object({ writerId: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: "invalid_payload" });
    // For now, incremental just returns accepted — full recompute handles scoring
    return reply.status(202).send({ accepted: true, writerId: body.data.writerId });
  });

  // ── Appeals ──

  server.post("/internal/appeals", async (req, reply) => {
    const userId = req.headers["x-auth-user-id"] as string | undefined;
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const parsed = RankingAppealCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const appeal = await repo.createAppeal(userId, parsed.data.reason);
    return reply.status(201).send({ appeal });
  });

  server.get("/internal/appeals", async (req) => {
    const status = (req.query as Record<string, string>).status as string | undefined;
    const appeals = await repo.listAppeals(status as "open" | "under_review" | "upheld" | "rejected" | undefined);
    return { appeals };
  });

  server.get("/internal/appeals/:appealId", async (req, reply) => {
    const { appealId } = req.params as { appealId: string };
    const appeal = await repo.getAppeal(appealId);
    if (!appeal) return reply.status(404).send({ error: "not_found" });
    return { appeal };
  });

  server.post("/internal/appeals/:appealId/resolve", async (req, reply) => {
    const userId = req.headers["x-auth-user-id"] as string | undefined;
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const { appealId } = req.params as { appealId: string };
    const parsed = RankingAppealResolveRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const appeal = await repo.resolveAppeal(appealId, userId, parsed.data.status, parsed.data.resolutionNote);
    if (!appeal) return reply.status(404).send({ error: "not_found" });

    try {
      await publisher({
        eventId: randomUUID(),
        eventType: "ranking_appeal_resolved",
        occurredAt: new Date().toISOString(),
        actorUserId: userId,
        targetUserId: appeal.writerId,
        resourceType: "ranking_appeal",
        resourceId: appealId,
        payload: { status: appeal.status }
      });
    } catch { /* non-fatal */ }

    return { appeal };
  });

  // ── Anti-gaming flags ──

  server.get("/internal/flags", async (req) => {
    const status = (req.query as Record<string, string>).status as string | undefined;
    const flags = await repo.listFlags(status as "open" | "dismissed" | "confirmed" | undefined);
    return { flags };
  });

  server.post("/internal/flags/:flagId/resolve", async (req, reply) => {
    const userId = req.headers["x-auth-user-id"] as string | undefined;
    if (!userId) return reply.status(403).send({ error: "forbidden" });
    const { flagId } = req.params as { flagId: string };
    const parsed = z.object({ status: z.enum(["dismissed", "confirmed"]) }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_payload" });
    const flag = await repo.resolveFlag(flagId, userId, parsed.data.status);
    if (!flag) return reply.status(404).send({ error: "not_found" });
    return { flag };
  });

  // ── Maintenance ──

  server.post("/internal/maintenance/snapshot", async () => {
    const total = await repo.getTotalRankedWriters();
    if (total === 0) return { snapshotsCreated: 0 };

    // Get all writers with scores and create snapshots
    const result = await repo.listLeaderboard({ limit: 10000, offset: 0 }, null);
    const rows = result.entries.map((e) => ({ writerId: e.writerId, totalScore: e.totalScore }));
    await repo.bulkCreateSnapshots(rows);
    return { snapshotsCreated: rows.length };
  });

  return server;
}

// ── Start ──

export async function startServer(): Promise<void> {
  const server = buildServer();
  const repo = new PgRankingRepository();
  await repo.init();

  const port = Number(process.env.PORT ?? 4007);
  await server.listen({ port, host: "0.0.0.0" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
