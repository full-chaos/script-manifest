"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Route } from "next";
import type { LeaderboardEntry } from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";

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

export default function LeaderboardPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

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
            icon="✨"
            title="The spotlight is waiting"
            description="Writers appear here as they submit to competitions and record placements. Be the first to climb the ranks."
            actionLabel="Browse competitions"
            actionHref={"/competitions" as Route}
          />
        ) : null}
        {rows.map((entry, index) => (
          <article key={`${entry.writerId}-${index}`} className="subcard">
            <div className="subcard-header">
              <strong>{index + 1}. {entry.writerId}</strong>
              <span className="badge">Score {entry.totalScore}</span>
            </div>
            <p className="muted mt-2">
              {entry.submissionCount} submissions | {entry.placementCount} placements
            </p>
            <p className="muted">Updated {entry.lastUpdatedAt ? new Date(entry.lastUpdatedAt).toLocaleString() : "n/a"}</p>
          </article>
        ))}
      </article>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
