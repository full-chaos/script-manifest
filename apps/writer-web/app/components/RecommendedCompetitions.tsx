"use client";

import Link from "next/link";
import type { Route } from "next";
import useSWR from "swr";
import type { CompetitionRecommendation, RecommendationsResponse } from "@script-manifest/contracts";
import { ApiError, fetcher } from "../lib/fetcher";
import { useToast } from "./toast";
import { SkeletonCard } from "./skeleton";

type RecommendedCompetitionsProps = {
  projectId: string;
};

export function RecommendedCompetitions({ projectId }: RecommendedCompetitionsProps) {
  const toast = useToast();
  const key = projectId ? `/api/v1/projects/${encodeURIComponent(projectId)}/recommended-competitions` : null;
  const { data, isLoading, mutate } = useSWR<RecommendationsResponse>(key, fetcher, {
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load recommendations.");
    }
  });

  const recommendations = Array.isArray(data?.recommendations)
    ? data.recommendations.slice(0, 10)
    : [];

  async function updateOverride(recommendation: CompetitionRecommendation, action: "dismiss" | "pin") {
    const isPinnedAction = action === "pin";
    const method = isPinnedAction && recommendation.isPinned ? "DELETE" : "POST";
    const response = await fetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(recommendation.competition.id)}/${action}`,
      { method }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? `Unable to ${action} recommendation.`);
      return;
    }
    await mutate();
    toast.success(action === "dismiss" ? "Recommendation dismissed." : recommendation.isPinned ? "Recommendation unpinned." : "Recommendation pinned.");
  }

  return (
    <article className="subcard stack">
      <div className="subcard-header">
        <div>
          <p className="eyebrow">Next Submissions</p>
          <h3 className="text-2xl text-foreground">Recommended competitions</h3>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void mutate()} disabled={isLoading}>
          Refresh matches
        </button>
      </div>

      {isLoading ? <SkeletonCard /> : null}
      {!isLoading && recommendations.length === 0 ? (
        <p className="muted">No open recommendations yet. Dismissed or submitted competitions are hidden.</p>
      ) : null}

      <div className="grid gap-3">
        {recommendations.map((recommendation) => (
          <article key={recommendation.competition.id} className="rounded-xl border border-zinc-300/60 bg-surface p-4">
            <div className="subcard-header">
              <div>
                <strong className="text-lg text-foreground">{recommendation.competition.title}</strong>
                <p className="muted mt-1">
                  {recommendation.competition.format} | {recommendation.competition.genre} | {new Date(recommendation.competition.deadline).toLocaleDateString()}
                </p>
              </div>
              <span className="stat-chip">{recommendation.score}/100</span>
            </div>

            <details className="mt-3 rounded-lg border border-border/60 p-3">
              <summary className="cursor-pointer font-semibold text-foreground">Why this match?</summary>
              <ul className="mt-2 space-y-1 text-sm text-foreground-secondary">
                {recommendation.reasons.map((reason) => (
                  <li key={`${recommendation.competition.id}-${reason.factor}`}>
                    <span className="font-semibold">{reason.contribution > 0 ? "+" : ""}{reason.contribution}</span> {reason.description}
                  </li>
                ))}
              </ul>
            </details>

            <div className="inline-form mt-3">
              <button type="button" className="btn btn-secondary" onClick={() => void updateOverride(recommendation, "pin")}>
                {recommendation.isPinned ? "Unpin" : "📌 Pin"}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void updateOverride(recommendation, "dismiss")}>
                Dismiss
              </button>
              <Link
                className="btn btn-primary"
                href={`/submissions?projectId=${encodeURIComponent(projectId)}&competitionId=${encodeURIComponent(recommendation.competition.id)}` as Route}
              >
                Submit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}
