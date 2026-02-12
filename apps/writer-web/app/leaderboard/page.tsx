"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Route } from "next";
import type { LeaderboardEntry } from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";

type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  total: number;
};

type Filters = {
  format: string;
  genre: string;
};

const initialFilters: Filters = {
  format: "",
  genre: ""
};

const avatarGradients = [
  "from-ember-500 to-ember-700",
  "from-tide-500 to-tide-700",
  "from-sky-500 to-sky-700",
  "from-violet-500 to-violet-700",
  "from-amber-500 to-amber-700"
];

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

export default function LeaderboardPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const maxScore = useMemo(() => {
    if (rows.length === 0) return 1;
    return Math.max(...rows.map((r) => r.totalScore), 1);
  }, [rows]);

  async function loadLeaderboard(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setStatus("");

    const search = new URLSearchParams();
    if (filters.format.trim()) {
      search.set("format", filters.format.trim());
    }
    if (filters.genre.trim()) {
      search.set("genre", filters.genre.trim());
    }

    try {
      const response = await fetch(`/api/v1/leaderboard?${search.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as Partial<LeaderboardResponse> & { error?: string };
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Leaderboard load failed.");
        return;
      }

      const nextRows = body.leaderboard ?? [];
      setRows(nextRows);
      setTotal(body.total ?? nextRows.length);
      setStatus(`Loaded ${nextRows.length} leaderboard rows.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLeaderboard();
  }, []);

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--tide animate-in">
        <p className="eyebrow eyebrow--tide">Leaderboard</p>
        <h1 className="text-4xl text-ink-900">Writer Spotlight</h1>
        <p className="max-w-3xl text-ink-700">
          Rankings reflect submission activity and placement outcomes, with transparent scoring weights
          and filter support.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <form className="stack" onSubmit={loadLeaderboard}>
          <div className="grid-two">
            <label className="stack-tight">
              <span>Format filter</span>
              <input
                className="input"
                value={filters.format}
                onChange={(event) => setFilters((current) => ({ ...current, format: event.target.value }))}
                placeholder="feature / tv / short"
              />
            </label>
            <label className="stack-tight">
              <span>Genre filter</span>
              <input
                className="input"
                value={filters.genre}
                onChange={(event) => setFilters((current) => ({ ...current, genre: event.target.value }))}
                placeholder="drama / comedy"
              />
            </label>
          </div>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Refreshing..." : "Refresh leaderboard"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFilters(initialFilters);
                void loadLeaderboard();
              }}
              disabled={loading}
            >
              Reset
            </button>
            <span className="badge">{total} total</span>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Writers</h2>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="sparkle" className="h-16 w-16 text-ink-900" />}
            title="The spotlight is waiting"
            description="Writers appear here as they submit to competitions and record placements. Be the first to climb the ranks."
            actionLabel="Browse competitions"
            actionHref={"/competitions" as Route}
          />
        ) : null}
        {rows.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((entry, index) => {
              const rank = index + 1;
              const pct = scorePercent(entry.totalScore, maxScore);
              return (
                <article key={`${entry.writerId}-${index}`} className="subcard flex gap-4">
                  {/* Rank + Avatar */}
                  <div className="flex flex-col items-center gap-1.5">
                    <span className={`text-sm font-bold ${rank <= 3 ? "text-ember-700" : "text-ink-500"}`}>
                      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
                    </span>
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${avatarGradient(entry.writerId)}`}>
                      {writerInitials(entry.writerId)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-900">{entry.writerId}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-500/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-ember-500 to-ember-700 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-ember-700">{entry.totalScore}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="stat-chip">{entry.submissionCount} submitted</span>
                      <span className="stat-chip">{entry.placementCount} placed</span>
                    </div>
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

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
