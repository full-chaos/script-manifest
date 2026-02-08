"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Competition } from "@script-manifest/contracts";

type Filters = {
  query: string;
  format: string;
  genre: string;
  maxFeeUsd: string;
};

const initialFilters: Filters = {
  query: "",
  format: "",
  genre: "",
  maxFeeUsd: ""
};

export default function CompetitionsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [results, setResults] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setStatus("");

    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("query", filters.query.trim());
    if (filters.format.trim()) params.set("format", filters.format.trim());
    if (filters.genre.trim()) params.set("genre", filters.genre.trim());
    if (filters.maxFeeUsd.trim()) params.set("maxFeeUsd", filters.maxFeeUsd.trim());

    try {
      const response = await fetch(`/api/v1/competitions?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Competition search failed.");
        return;
      }

      const competitions = body.competitions as Competition[];
      setResults(competitions);
      setStatus(`Found ${competitions.length as number} competitions.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void search();
  }, []);

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Competition Directory</p>
        <h1 className="text-4xl text-ink-900">A vetted directory, not a random spreadsheet</h1>
        <p className="max-w-3xl text-ink-700">
          Filter by format, genre, fee, and deadline to find opportunities without manually
          cross-referencing dozens of websites.
        </p>
      </article>

      <article className="panel stack">
        <form className="stack" onSubmit={search}>
          <label className="stack-tight">
            <span>Keyword</span>
            <input
              className="input"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Title or description"
            />
          </label>

          <div className="grid-three">
            <label className="stack-tight">
              <span>Format</span>
              <input
                className="input"
                value={filters.format}
                onChange={(event) => setFilters((current) => ({ ...current, format: event.target.value }))}
                placeholder="feature / tv / short"
              />
            </label>
            <label className="stack-tight">
              <span>Genre</span>
              <input
                className="input"
                value={filters.genre}
                onChange={(event) => setFilters((current) => ({ ...current, genre: event.target.value }))}
                placeholder="drama / comedy"
              />
            </label>
            <label className="stack-tight">
              <span>Max fee (USD)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={filters.maxFeeUsd}
                onChange={(event) => setFilters((current) => ({ ...current, maxFeeUsd: event.target.value }))}
              />
            </label>
          </div>

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFilters(initialFilters);
                setResults([]);
                setStatus("");
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack">
        <div className="subcard-header">
          <h2 className="section-title">Results</h2>
          <span className="badge">{results.length} matches</span>
        </div>
        {results.length === 0 ? <p className="empty-state">No results yet.</p> : null}
        {results.map((competition) => (
          <article key={competition.id} className="subcard">
            <div className="subcard-header">
              <strong className="text-lg text-ink-900">{competition.title}</strong>
              <span className="badge">{competition.format}</span>
            </div>
            <p className="mt-2 text-sm text-ink-700">{competition.description}</p>
            <p className="muted mt-2">
              {competition.genre} | ${competition.feeUsd} | deadline {new Date(competition.deadline).toLocaleDateString()}
            </p>
          </article>
        ))}
      </article>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
