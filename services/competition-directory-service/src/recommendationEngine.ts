import type { Competition, CompetitionRecommendation, RecommendationsResponse, Project } from "@script-manifest/contracts";

export type PrestigeTier = "standard" | "notable" | "elite" | "premier";
export type FeeTier = NonNullable<Competition["feeTier"]>;

export type RecommendationInput = {
  competition: Competition;
  isDismissed?: boolean;
  isPinned?: boolean;
  alreadySubmitted?: boolean;
  prestigeTier?: PrestigeTier;
};

export type RecommendForProjectOptions = {
  project: Project;
  competitions: Array<Competition | RecommendationInput>;
  dismissedCompetitionIds?: ReadonlySet<string>;
  pinnedCompetitionIds?: ReadonlySet<string>;
  submittedCompetitionIds?: ReadonlySet<string>;
  prestigeByCompetitionId?: ReadonlyMap<string, PrestigeTier>;
  preferredFeeTier?: FeeTier | null;
  includeDismissed?: boolean;
  now?: Date;
  limit?: number;
};

type Reason = CompetitionRecommendation["reasons"][number];

const adjacentGenres = new Map<string, ReadonlySet<string>>([
  ["drama", new Set(["family", "romance", "historical", "literary"])],
  ["comedy", new Set(["romance", "family", "animation"])],
  ["horror", new Set(["thriller", "sci-fi", "science fiction", "fantasy"])],
  ["thriller", new Set(["horror", "mystery", "crime", "action"])],
  ["sci-fi", new Set(["science fiction", "fantasy", "horror"])],
  ["science fiction", new Set(["sci-fi", "fantasy", "horror"])],
  ["fantasy", new Set(["sci-fi", "science fiction", "animation", "horror"])],
  ["action", new Set(["thriller", "adventure", "crime"])],
  ["romance", new Set(["comedy", "drama", "family"])]
]);

export function recommendForProject(projectId: string, opts: RecommendForProjectOptions): RecommendationsResponse {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 20;
  const recommendations = opts.competitions
    .map((raw) => normalizeInput(raw, opts))
    .filter((input) => opts.includeDismissed || !input.isDismissed)
    .filter((input) => !input.alreadySubmitted)
    .map((input) => scoreRecommendation(opts.project, input, opts.preferredFeeTier ?? null, now))
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      return new Date(left.competition.deadline).getTime() - new Date(right.competition.deadline).getTime();
    })
    .slice(0, limit);

  return { projectId, recommendations };
}

function normalizeInput(raw: Competition | RecommendationInput, opts: RecommendForProjectOptions): Required<RecommendationInput> {
  const input = "competition" in raw ? raw : { competition: raw };
  const id = input.competition.id;
  return {
    competition: input.competition,
    isDismissed: input.isDismissed ?? opts.dismissedCompetitionIds?.has(id) ?? false,
    isPinned: input.isPinned ?? opts.pinnedCompetitionIds?.has(id) ?? false,
    alreadySubmitted: input.alreadySubmitted ?? opts.submittedCompetitionIds?.has(id) ?? false,
    prestigeTier: input.prestigeTier ?? opts.prestigeByCompetitionId?.get(id) ?? "standard"
  };
}

function scoreRecommendation(project: Project, input: Required<RecommendationInput>, preferredFeeTier: FeeTier | null, now: Date): CompetitionRecommendation {
  if (input.isPinned) {
    return {
      competition: input.competition,
      score: 100,
      reasons: [{ factor: "pinned", contribution: 100, description: "Pinned by you." }],
      isPinned: true,
      isDismissed: input.isDismissed
    };
  }

  const reasons: Reason[] = [
    scoreFormat(project, input.competition),
    scoreGenre(project, input.competition),
    scoreLanguage(project, input.competition),
    scoreLocation(project, input.competition),
    scoreFeeTier(input.competition, preferredFeeTier),
    scoreDeadline(input.competition, now),
    scorePrestige(input.prestigeTier)
  ];
  const total = reasons.reduce((sum, reason) => sum + reason.contribution, 0);
  return {
    competition: input.competition,
    score: clamp(total, 0, 100),
    reasons,
    isPinned: false,
    isDismissed: input.isDismissed
  };
}

function scoreFormat(project: Project, competition: Competition): Reason {
  if (same(project.format, competition.format)) {
    return { factor: "format", contribution: 40, description: `Format matches ${project.format}.` };
  }
  return { factor: "format", contribution: competition.format ? -20 : 0, description: `Format differs from ${project.format}.` };
}

function scoreGenre(project: Project, competition: Competition): Reason {
  const projectGenre = normalize(project.genre);
  const competitionGenre = normalize(competition.genre);
  if (projectGenre === competitionGenre) {
    return { factor: "genre", contribution: 30, description: `Genre matches ${project.genre}.` };
  }
  if (adjacentGenres.get(projectGenre)?.has(competitionGenre)) {
    return { factor: "genre", contribution: 15, description: `${competition.genre} is adjacent to ${project.genre}.` };
  }
  return { factor: "genre", contribution: -10, description: `Genre differs from ${project.genre}.` };
}

function scoreLanguage(project: Project, competition: Competition): Reason {
  const projectLanguage = project.language ?? "en";
  const competitionLanguage = competition.language ?? "en";
  if (same(projectLanguage, competitionLanguage)) {
    return { factor: "language", contribution: 10, description: `Language matches ${projectLanguage}.` };
  }
  return { factor: "language", contribution: -10, description: `Language ${competitionLanguage} differs from ${projectLanguage}.` };
}

function scoreLocation(project: Project, competition: Competition): Reason {
  const projectCountry = project.country ?? "Worldwide";
  const location = competition.location ?? "Worldwide";
  if (same(location, "Worldwide") || same(projectCountry, location)) {
    return { factor: "location", contribution: 5, description: same(location, "Worldwide") ? "Open worldwide." : `Location matches ${projectCountry}.` };
  }
  return { factor: "location", contribution: -5, description: `Location ${location} differs from ${projectCountry}.` };
}

function scoreFeeTier(competition: Competition, preferredFeeTier: FeeTier | null): Reason {
  if (!preferredFeeTier || !competition.feeTier) {
    return { factor: "fee_tier", contribution: 0, description: "No fee preference yet." };
  }
  if (competition.feeTier === preferredFeeTier) {
    return { factor: "fee_tier", contribution: 10, description: `Fee tier matches recent ${preferredFeeTier} submissions.` };
  }
  return { factor: "fee_tier", contribution: 0, description: `Fee tier differs from recent ${preferredFeeTier} submissions.` };
}

function scoreDeadline(competition: Competition, now: Date): Reason {
  const days = Math.ceil((new Date(competition.deadline).getTime() - now.getTime()) / 86_400_000);
  if (days <= 14) return { factor: "deadline", contribution: 15, description: "Deadline is within 14 days." };
  if (days <= 30) return { factor: "deadline", contribution: 10, description: "Deadline is within 30 days." };
  if (days <= 60) return { factor: "deadline", contribution: 5, description: "Deadline is within 60 days." };
  return { factor: "deadline", contribution: 0, description: "Deadline is more than 60 days away." };
}

function scorePrestige(tier: PrestigeTier): Reason {
  if (tier === "elite" || tier === "premier") return { factor: "prestige", contribution: 10, description: "Elite competition prestige." };
  if (tier === "notable") return { factor: "prestige", contribution: 5, description: "Notable competition prestige." };
  return { factor: "prestige", contribution: 0, description: "Standard competition prestige." };
}

function same(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
