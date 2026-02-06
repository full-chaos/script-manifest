"use client";

import { useState, type FormEvent } from "react";
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

      setResults(body.competitions as Competition[]);
      setStatus(`Found ${body.competitions.length as number} competitions.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Competition Directory</h2>
      <p className="muted">Search directory records indexed for Phase 1.</p>

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

        <div className="grid-two">
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
        </div>

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

        <div className="inline-form">
          <button type="submit" className="btn btn-active" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
          <button
            type="button"
            className="btn"
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

      <section className="stack">
        {results.length === 0 ? <p className="muted">No results yet.</p> : null}
        {results.map((competition) => (
          <article key={competition.id} className="subcard">
            <strong>{competition.title}</strong>
            <p>{competition.description}</p>
            <p className="muted">
              {competition.format} | {competition.genre} | ${competition.feeUsd} | deadline{" "}
              {new Date(competition.deadline).toLocaleDateString()}
            </p>
          </article>
        ))}
      </section>

      {status ? <p className="status-note">{status}</p> : null}
    </section>
  );
}
