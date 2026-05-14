import type { Route } from "next";
import type { RankedWriterEntry, TierDesignation } from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { ApiError } from "../lib/fetcher";
import { serverFetch } from "../lib/serverFetch";
import { LeaderboardFilters } from "./filters";

type LeaderboardResponse = {
  leaderboard: RankedWriterEntry[];
  total: number;
};

type LeaderboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const avatarGradients = [
  "from-ember-500 to-ember-700",
  "from-tide-500 to-tide-700",
  "from-sky-500 to-sky-700",
  "from-violet-500 to-violet-700",
  "from-amber-500 to-amber-700"
];

const tierLabels: Record<TierDesignation, string> = {
  top_1: "Top 1%",
  top_2: "Top 2%",
  top_10: "Top 10%",
  top_25: "Top 25%"
};

const tierColors: Record<TierDesignation, string> = {
  top_1: "bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 border-amber-400/60 dark:border-amber-300/45",
  top_2: "bg-slate-100 text-slate-700 border-slate-300",
  top_10: "bg-orange-100 text-orange-700 border-orange-300",
  top_25: "bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400 border-sky-400/60 dark:border-sky-300/45"
};

function avatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return avatarGradients[Math.abs(hash) % avatarGradients.length]!;
}

function writerInitials(id: string): string {
  const clean = id.replace(/^writer_/, "").replace(/[_-]/g, " ").trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function scorePercent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.min(100, Math.round((score / maxScore) * 100));
}

function stringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildLeaderboardSearchParams(input: Record<string, string | string[] | undefined>) {
  const searchParams: Record<string, string | boolean | undefined> = {};
  const format = stringParam(input.format)?.trim();
  const genre = stringParam(input.genre)?.trim();
  const tier = stringParam(input.tier)?.trim();
  const trending = stringParam(input.trending)?.trim();

  if (format) {
    searchParams.format = format;
  }
  if (genre) {
    searchParams.genre = genre;
  }
  if (tier) {
    searchParams.tier = tier;
  }
  if (trending === "true") {
    searchParams.trending = true;
  }
  return searchParams;
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  let data: LeaderboardResponse = { leaderboard: [], total: 0 };
  let error: string | null = null;
  const filters = await searchParams;
  const leaderboardSearchParams = buildLeaderboardSearchParams(filters);

  try {
    data = await serverFetch<LeaderboardResponse>("/api/v1/leaderboard", { searchParams: leaderboardSearchParams });
  } catch (caught) {
    if (caught instanceof ApiError) {
      error = caught.message;
    } else {
      error = "Leaderboard load failed.";
    }
  }

  const rows = data.leaderboard;
  const total = data.total;
  const maxScore = rows.length === 0 ? 1 : Math.max(...rows.map((r) => r.totalScore), 1);

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--tide animate-in">
        <p className="eyebrow eyebrow--tide">Leaderboard</p>
        <h1 className="text-4xl text-foreground">Writer Spotlight</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Prestige-weighted rankings with time decay, verification scoring, and transparent methodology.
          Explore the <a href="/rankings/methodology" className="underline hover:text-tide-700 dark:text-tide-500">scoring methodology</a>.
        </p>
      </article>

      <LeaderboardFilters total={total} />

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Writers</h2>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="sparkle" className="h-16 w-16 text-foreground" />}
            title="The spotlight is waiting"
            description="Writers appear here as they submit to competitions and record placements. Be the first to climb the ranks."
            actionLabel="Browse competitions"
            actionHref={"/competitions" as Route}
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((entry) => {
              const pct = scorePercent(entry.totalScore, maxScore);
              return (
                <article key={entry.writerId} className="subcard flex gap-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={`text-sm font-bold ${entry.rank <= 3 ? "text-primary-dark dark:text-primary" : "text-muted"}`}>
                      #{entry.rank}
                    </span>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br text-sm font-bold text-white ${avatarGradient(entry.writerId)}`}>
                      {writerInitials(entry.writerId)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{entry.writerId}</p>
                      {entry.tier ? (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tierColors[entry.tier]}`}>
                          {tierLabels[entry.tier]}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-500/10">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-ember-500 to-ember-700 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-primary-dark dark:text-primary">
                        {entry.totalScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="stat-chip">{entry.submissionCount} submitted</span>
                      <span className="stat-chip">{entry.placementCount} placed</span>
                      <TrendingIndicator delta={entry.scoreChange30d} />
                    </div>
                    {entry.badges.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.badges.map((label) => (
                          <span
                            key={label}
                            className="inline-flex items-center rounded-full bg-tide-500/15 dark:bg-tide-500/20 border border-tide-400/60 dark:border-tide-300/45 px-2 py-0.5 text-xs font-medium text-tide-800 dark:text-tide-300"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {entry.lastUpdatedAt ? (
                      <p className="muted mt-1 text-xs">
                        Updated {new Date(entry.lastUpdatedAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </article>

      {error ? (
        <p className="status-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function TrendingIndicator({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
  return (
    <span className={`stat-chip ${isPositive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-300"}`}>
      {isPositive ? "\u25B2" : "\u25BC"} {Math.abs(delta).toFixed(1)} (30d)
    </span>
  );
}
