"use client";

import Link from "next/link";
import useSWR from "swr";
import type { SavedCompetition } from "@script-manifest/contracts";
import { fetcher } from "../lib/fetcher";
import { useAuth } from "../lib/AuthProvider";
import { useClock } from "../lib/useClock";
import { EmptyState } from "./emptyState";
import { EmptyIllustration } from "./illustrations";

type SavedCompetitionsResponse = {
  savedCompetitions: SavedCompetition[];
};

export function NextDeadlinesPanel() {
  const { user } = useAuth();
  const now = useClock(60_000);
  const { data, isLoading } = useSWR<SavedCompetitionsResponse>(
    user ? "/api/v1/writers/me/saved-competitions" : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  if (!user) return null;

  const nextDeadlines = (data?.savedCompetitions ?? [])
    .map((savedCompetition) => savedCompetition.competition)
    .filter((competition): competition is NonNullable<SavedCompetition["competition"]> => {
      if (!competition) return false;
      const deadline = new Date(competition.deadline).getTime();
      return Number.isFinite(deadline) && deadline > now;
    })
    .sort((left, right) => new Date(left.deadline).getTime() - new Date(right.deadline).getTime())
    .slice(0, 5);

  return (
    <article className="panel stack animate-in animate-in-delay-1">
      <div className="subcard-header">
        <div>
          <p className="eyebrow">Saved competitions</p>
          <h2 className="section-title">Next deadlines</h2>
        </div>
        <Link href="/competitions" className="btn btn-secondary no-underline">Manage saves</Link>
      </div>

      {isLoading ? <p className="muted">Loading saved deadlines…</p> : null}
      {!isLoading && nextDeadlines.length === 0 ? (
        <EmptyState
          illustration={<EmptyIllustration variant="calendar" className="h-14 w-14 text-foreground" />}
          title="No saved deadlines yet"
          description="Save competitions from the directory to track your next submission windows here."
        />
      ) : null}

      <ol className="stack" aria-label="Saved competition deadlines">
        {nextDeadlines.map((competition) => (
          <li key={competition.id} className="subcard subcard-header">
            <div>
              <h3 className="text-lg text-foreground">{competition.title}</h3>
              <p className="muted">{competition.format} · {competition.genre}</p>
            </div>
            <span className="badge">{new Date(competition.deadline).toLocaleDateString()}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
