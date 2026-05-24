"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { CoverageProvider, CoverageProviderReview, ProviderVerificationEvent, ProviderVerificationState } from "@script-manifest/contracts";
import { fetcher, ApiError } from "../../lib/fetcher";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { ProviderVerificationBadge } from "../../coverage/components/ProviderVerificationBadge";

const QUEUE_KEY = "/api/v1/admin/providers/review-queue";

type ProviderQueueEntry = {
  provider: CoverageProvider;
  latestReview: CoverageProviderReview | null;
};

type VerificationArg = {
  providerId: string;
  state: ProviderVerificationState;
  reason?: string;
  checklist: string[];
};

async function updateVerificationFetcher(_key: string, { arg }: { arg: VerificationArg }): Promise<{ provider: CoverageProvider }> {
  return fetcher<{ provider: CoverageProvider }>(
    `/api/v1/admin/providers/${encodeURIComponent(arg.providerId)}/verification`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: arg.state,
        ...(arg.reason ? { reason: arg.reason } : {}),
        checklist: arg.checklist,
      }),
    }
  );
}

function splitChecklist(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export default function AdminProvidersPage() {
  const toast = useToast();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [state, setState] = useState<ProviderVerificationState>("verified");
  const [reason, setReason] = useState("");
  const [checklist, setChecklist] = useState("identity reviewed\ncoverage samples reviewed");
  const [formError, setFormError] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<{ entries: ProviderQueueEntry[] }>(QUEUE_KEY);
  const entries = data?.entries ?? [];
  const selectedProvider = entries.find((entry) => entry.provider.id === selectedProviderId)?.provider ?? entries[0]?.provider ?? null;
  const eventsKey = selectedProvider ? `/api/v1/admin/providers/${encodeURIComponent(selectedProvider.id)}/verification` : null;
  const { data: eventsData } = useSWR<{ events: ProviderVerificationEvent[] }>(eventsKey);
  const events = eventsData?.events ?? [];
  const { trigger, isMutating } = useSWRMutation(QUEUE_KEY, updateVerificationFetcher);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider) return;
    if ((state === "rejected" || state === "suspended") && !reason.trim()) {
      setFormError("Reason is required for rejected or suspended providers.");
      return;
    }
    setFormError(null);
    try {
      await trigger({ providerId: selectedProvider.id, state, reason: reason.trim() || undefined, checklist: splitChecklist(checklist) });
      toast.success("Provider verification updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update provider verification.");
    }
  }

  function selectProvider(provider: CoverageProvider) {
    setSelectedProviderId(provider.id);
    setState(provider.verificationState);
    setReason(provider.verificationNotes ?? "");
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl text-foreground">Provider Verification</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review marketplace providers, record verification decisions, and inspect trust-state history.
        </p>
      </article>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="panel stack animate-in animate-in-delay-1">
          <h2 className="section-title">Review queue</h2>
          {isLoading ? (
            <div className="stack"><SkeletonCard /><SkeletonCard /></div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error instanceof ApiError ? error.message : "Failed to load providers."}</p>
          ) : entries.length === 0 ? (
            <EmptyState illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />} title="No providers" description="There are no providers awaiting review." />
          ) : (
            <div className="stack">
              {entries.map(({ provider }) => (
                <button
                  key={provider.id}
                  type="button"
                  className="subcard text-left"
                  onClick={() => selectProvider(provider)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong className="text-foreground">{provider.displayName}</strong>
                      <p className="text-sm text-foreground-secondary">{provider.specialties.join(", ") || "No specialties listed"}</p>
                    </div>
                    <span className="badge">{provider.verificationState}</span>
                  </div>
                  <div className="mt-2"><ProviderVerificationBadge badge={provider.badge} /></div>
                </button>
              ))}
            </div>
          )}
        </article>

        <aside className="panel stack animate-in animate-in-delay-2">
          <h2 className="section-title">Verification action</h2>
          {selectedProvider ? (
            <>
              <div className="stack-tight">
                <strong>{selectedProvider.displayName}</strong>
                <ProviderVerificationBadge badge={selectedProvider.badge} variant="full" />
              </div>
              <form className="stack" onSubmit={handleSubmit}>
                <label className="stack-tight">
                  <span className="text-sm font-medium text-foreground">Verification state</span>
                  <select className="input" value={state} onChange={(event) => setState(event.target.value as ProviderVerificationState)}>
                    <option value="verified">Verified</option>
                    <option value="unverified">Unverified</option>
                    <option value="rejected">Rejected</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
                <label className="stack-tight">
                  <span className="text-sm font-medium text-foreground">Reason</span>
                  <textarea className="input min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} />
                </label>
                <label className="stack-tight">
                  <span className="text-sm font-medium text-foreground">Checklist</span>
                  <textarea className="input min-h-24" value={checklist} onChange={(event) => setChecklist(event.target.value)} />
                </label>
                {formError ? <p className="text-sm text-red-600 dark:text-red-400">{formError}</p> : null}
                <button type="submit" className="btn btn-primary" disabled={isMutating}>{isMutating ? "Updating..." : "Update verification"}</button>
              </form>
              <div className="stack-tight">
                <h3 className="text-sm font-semibold text-foreground">Event history</h3>
                {events.length === 0 ? <p className="text-sm text-muted">No verification events yet.</p> : events.map((event) => (
                  <article key={event.id} className="rounded-lg border border-border/55 p-2 text-sm">
                    <strong>{event.fromState ?? "none"} → {event.toState}</strong>
                    {event.reason ? <p className="text-foreground-secondary">{event.reason}</p> : null}
                  </article>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted">Select a provider to review.</p>}
        </aside>
      </div>
    </section>
  );
}
