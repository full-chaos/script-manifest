import type { FastifyInstance } from "fastify";
import {
  LeaderboardFiltersSchema,
  PlacementListItemSchema,
  SubmissionSchema,
  type PlacementListItem,
  type Submission
} from "@script-manifest/contracts";
import { type GatewayContext, safeJsonParse } from "../helpers.js";

export function registerLeaderboardRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/leaderboard", async (req, reply) => {
    const parsedFilters = LeaderboardFiltersSchema.safeParse(req.query);
    if (!parsedFilters.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedFilters.error.flatten()
      });
    }

    const filters = parsedFilters.data;
    const visibleProjectIds = await resolveVisibleProjectIds(ctx, filters);
    const submissionRows = await fetchSubmissionsForLeaderboard(ctx);
    if ("error" in submissionRows) {
      return reply.status(submissionRows.statusCode).send({ error: submissionRows.error });
    }

    const filteredSubmissions = submissionRows.submissions.filter((submission) => {
      if (!visibleProjectIds) {
        return true;
      }
      return visibleProjectIds.has(submission.projectId);
    });

    const placementRows = await fetchPlacementsForLeaderboard(ctx);
    if ("error" in placementRows) {
      return reply.status(placementRows.statusCode).send({ error: placementRows.error });
    }

    const submissionById = new Map<string, Submission>(
      filteredSubmissions.map((submission) => [submission.id, submission])
    );
    const filteredPlacements = placementRows.placements.filter((placement) =>
      submissionById.has(placement.submissionId)
    );

    const leaderboard = buildLeaderboardRows(filteredSubmissions, filteredPlacements);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    return reply.send({
      leaderboard: leaderboard.slice(offset, offset + limit),
      total: leaderboard.length
    });
  });
}

async function resolveVisibleProjectIds(
  ctx: GatewayContext,
  filters: { format?: string; genre?: string }
): Promise<Set<string> | null> {
  if (!filters.format && !filters.genre) {
    return null;
  }

  const search = new URLSearchParams();
  if (filters.format) {
    search.set("format", filters.format);
  }
  if (filters.genre) {
    search.set("genre", filters.genre);
  }
  search.set("limit", "100");
  search.set("offset", "0");

  try {
    const response = await ctx.requestFn(`${ctx.profileServiceBase}/internal/projects?${search.toString()}`, {
      method: "GET"
    });
    if (response.statusCode >= 400) {
      return null;
    }
    const body = safeJsonParse(await response.body.text()) as {
      projects?: Array<{ id?: string }>;
    };
    const ids = new Set<string>();
    for (const project of body.projects ?? []) {
      if (typeof project.id === "string" && project.id.length > 0) {
        ids.add(project.id);
      }
    }
    return ids;
  } catch {
    return null;
  }
}

async function fetchSubmissionsForLeaderboard(
  ctx: GatewayContext
): Promise<{ submissions: Submission[] } | { error: string; statusCode: number }> {
  try {
    const response = await ctx.requestFn(`${ctx.submissionTrackingBase}/internal/submissions`, {
      method: "GET"
    });
    if (response.statusCode >= 400) {
      return { error: "submissions_unavailable", statusCode: 502 };
    }
    const body = safeJsonParse(await response.body.text()) as { submissions?: unknown[] };
    const submissions: Submission[] = [];
    for (const row of body.submissions ?? []) {
      const parsed = SubmissionSchema.safeParse(row);
      if (parsed.success) {
        submissions.push(parsed.data);
      }
    }
    return { submissions };
  } catch {
    return { error: "submissions_unavailable", statusCode: 502 };
  }
}

async function fetchPlacementsForLeaderboard(
  ctx: GatewayContext
): Promise<{ placements: PlacementListItem[] } | { error: string; statusCode: number }> {
  try {
    const response = await ctx.requestFn(`${ctx.submissionTrackingBase}/internal/placements`, {
      method: "GET"
    });
    if (response.statusCode >= 400) {
      return { error: "placements_unavailable", statusCode: 502 };
    }
    const body = safeJsonParse(await response.body.text()) as { placements?: unknown[] };
    const placements: PlacementListItem[] = [];
    for (const row of body.placements ?? []) {
      const parsed = PlacementListItemSchema.safeParse(row);
      if (parsed.success) {
        placements.push(parsed.data);
      }
    }
    return { placements };
  } catch {
    return { error: "placements_unavailable", statusCode: 502 };
  }
}

function buildLeaderboardRows(submissions: Submission[], placements: PlacementListItem[]) {
  const statusWeights: Record<Submission["status"], number> = {
    pending: 0,
    quarterfinalist: 2,
    semifinalist: 4,
    finalist: 7,
    winner: 10
  };
  const placementMultipliers: Record<PlacementListItem["verificationState"], number> = {
    pending: 0.5,
    verified: 1,
    rejected: 0
  };

  const byWriter = new Map<
    string,
    { writerId: string; totalScore: number; submissionCount: number; placementCount: number; lastUpdatedAt: string | null }
  >();
  const submissionById = new Map<string, Submission>(submissions.map((submission) => [submission.id, submission]));

  for (const submission of submissions) {
    const row = byWriter.get(submission.writerId) ?? {
      writerId: submission.writerId,
      totalScore: 0,
      submissionCount: 0,
      placementCount: 0,
      lastUpdatedAt: null
    };
    row.submissionCount += 1;
    row.totalScore += statusWeights[submission.status];
    row.lastUpdatedAt = maxIsoTimestamp(row.lastUpdatedAt, submission.updatedAt);
    byWriter.set(submission.writerId, row);
  }

  for (const placement of placements) {
    const submission = submissionById.get(placement.submissionId);
    if (!submission) {
      continue;
    }
    const row = byWriter.get(submission.writerId) ?? {
      writerId: submission.writerId,
      totalScore: 0,
      submissionCount: 0,
      placementCount: 0,
      lastUpdatedAt: null
    };
    row.placementCount += 1;
    row.totalScore += Math.round(statusWeights[placement.status] * placementMultipliers[placement.verificationState]);
    row.lastUpdatedAt = maxIsoTimestamp(row.lastUpdatedAt, placement.updatedAt);
    byWriter.set(submission.writerId, row);
  }

  return Array.from(byWriter.values()).sort((left, right) => {
    if (right.totalScore !== left.totalScore) {
      return right.totalScore - left.totalScore;
    }
    if (right.placementCount !== left.placementCount) {
      return right.placementCount - left.placementCount;
    }
    return right.submissionCount - left.submissionCount;
  });
}

function maxIsoTimestamp(left: string | null, right: string): string {
  if (!left) {
    return right;
  }
  return left > right ? left : right;
}
