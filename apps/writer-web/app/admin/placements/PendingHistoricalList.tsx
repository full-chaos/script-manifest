"use client";

import { useState } from "react";
import type { PlacementListItem, PlacementVerificationState } from "@script-manifest/contracts";
import useSWR from "swr";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { ApiError, fetcher } from "../../lib/fetcher";

export function PendingHistoricalList() {
  const toast = useToast();
  const [mutating, setMutating] = useState(false);
  const { data, isLoading, mutate } = useSWR<{ placements: PlacementListItem[] }>(
    "/api/v1/placements?isHistorical=true&verificationState=pending",
    {
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to load historical placements.");
      }
    }
  );

  const placements = data?.placements ?? [];

  async function reviewPlacement(placementId: string, verificationState: Extract<PlacementVerificationState, "verified" | "rejected">) {
    const reviewNotes = window.prompt(verificationState === "verified" ? "Approval notes" : "Rejection notes") ?? undefined;
    setMutating(true);
    try {
      await fetcher(`/api/v1/placements/${encodeURIComponent(placementId)}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificationState, reviewNotes })
      });
      void mutate();
      toast.success(`Placement ${verificationState}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to review placement.");
    } finally {
      setMutating(false);
    }
  }

  return (
    <article className="panel stack">
      <div className="subcard-header">
        <h2 className="section-title">Pending historical placements</h2>
        <span className="badge">{placements.length} pending</span>
      </div>

      {isLoading ? (
        <div className="stack"><SkeletonCard /><SkeletonCard /></div>
      ) : placements.length === 0 ? (
        <EmptyState
          illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
          title="No pending evidence"
          description="Historical placements awaiting review will appear here."
        />
      ) : null}

      {!isLoading ? placements.map((placement) => (
        <article key={placement.id} className="subcard">
          <div className="subcard-header">
            <strong>{placement.id}</strong>
            <span className="badge">{placement.status}</span>
            <span className="badge">{placement.badgeLabel}</span>
          </div>
          <div className="mt-2 inline-form">
            <span className="text-sm text-muted">Writer: {placement.writerId}</span>
            <span className="text-sm text-muted">Project: {placement.projectId}</span>
            <span className="text-sm text-muted">Competition: {placement.competitionId}</span>
          </div>
          {placement.sourceNote ? <p className="muted mt-2">{placement.sourceNote}</p> : null}
          <div className="inline-form mt-3">
            <button className="btn btn-primary" type="button" disabled={mutating} onClick={() => void reviewPlacement(placement.id, "verified")}>Approve</button>
            <button className="btn btn-danger" type="button" disabled={mutating} onClick={() => void reviewPlacement(placement.id, "rejected")}>Reject</button>
          </div>
        </article>
      )) : null}
    </article>
  );
}
