"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { TrustProofMetricsAdminResponse } from "@script-manifest/contracts";
import { ApiError, fetcher } from "../../lib/fetcher";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";

const TRUST_METRICS_KEY = "/api/v1/admin/trust-proof-metrics";

const metricCards = [
  ["scriptsHostedTotal", "Hosted public scripts"],
  ["placementsRecordedTotal", "Recorded placements"],
  ["placementsVerifiedTotal", "Verified placements"],
  ["competitionsTrackedTotal", "Tracked competitions"],
  ["exportsGeneratedTotal", "Generated exports"],
  ["verifiedIndustryDownloadsTotal", "Verified industry downloads"],
  ["writersExportablePct", "Writer exportable coverage"]
] as const;

const sourceStampLabels = [
  "scriptsMaxUpdatedAt",
  "placementsMaxUpdatedAt",
  "competitionsMaxSavedAt",
  "exportsMaxGeneratedAt",
  "downloadsMaxDownloadedAt",
  "writersMaxUpdatedAt"
] as const;

async function refreshFetcher(): Promise<TrustProofMetricsAdminResponse> {
  return fetcher<TrustProofMetricsAdminResponse>(TRUST_METRICS_KEY, { method: "POST" });
}

function formatValue(key: (typeof metricCards)[number][0], value: number): string {
  if (key === "writersExportablePct") return `${value}%`;
  return value.toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "Not yet recorded";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default function TrustMetricsAdminPage() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<TrustProofMetricsAdminResponse>(TRUST_METRICS_KEY, fetcher, {
    refreshInterval: 60_000,
    shouldRetryOnError: false
  });
  const { trigger, isMutating } = useSWRMutation(TRUST_METRICS_KEY, refreshFetcher);

  async function handleRefresh() {
    try {
      const refreshed = await trigger();
      await mutate(refreshed, { revalidate: true });
      toast.success("Trust metrics snapshot refreshed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to refresh trust metrics.");
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Trust Metrics</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Read-through for public trust proof counters, source freshness, and refresh health.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Current public counters</h2>
            {data ? (
              <p className="text-sm text-muted">Snapshot {formatDate(data.metrics.snapshotAt)} · cache TTL {data.refresh.cacheTtlSeconds}s</p>
            ) : null}
          </div>
          <button type="button" className="btn btn-secondary" disabled={isMutating} onClick={() => { void handleRefresh(); }}>
            {isMutating ? "Refreshing..." : "Refresh snapshot"}
          </button>
        </div>

        {isLoading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof ApiError ? error.message : "Unable to load trust metrics."}
          </p>
        ) : data ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger">
            {metricCards.map(([key, label]) => (
              <div key={key} className="subcard flex flex-col items-center gap-1 py-5 text-center">
                <span className="text-3xl font-bold tabular-nums text-foreground">{formatValue(key, data.metrics[key])}</span>
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No trust metrics snapshot is available yet.</p>
        )}
      </article>

      {data ? (
        <article className="panel stack animate-in animate-in-delay-2">
          <h2 className="section-title">Source stamps</h2>
          <dl className="grid gap-3 md:grid-cols-2">
            {sourceStampLabels.map((label) => (
              <div key={label} className="subcard">
                <dt className="font-mono text-xs text-muted">{label}</dt>
                <dd className="text-sm text-foreground-secondary">{formatDate(data.metrics.sourceDataStamps[label])}</dd>
              </div>
            ))}
          </dl>
        </article>
      ) : null}

      {data ? (
        <article className="panel stack animate-in animate-in-delay-3">
          <h2 className="section-title">Warnings</h2>
          {data.refresh.warnings.length > 0 ? (
            <ul className="space-y-2 text-sm text-foreground-secondary">
              {data.refresh.warnings.map((warning) => (
                <li key={`${warning.metric}-${warning.reason}`} className="subcard">
                  <strong className="text-foreground">{warning.metric}</strong>
                  <p>{warning.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No source warnings.</p>
          )}
        </article>
      ) : null}

      <article className="panel stack animate-in animate-in-delay-4">
        <h2 className="section-title">Source SQL notes</h2>
        <ul className="space-y-1 text-sm text-foreground-secondary">
          <li>Scripts: public visibility only.</li>
          <li>Placements: recorded rows plus verified-only subset.</li>
          <li>Exports: generated writer export events only; failed events are retained for audit but excluded from public totals.</li>
          <li>Downloads: industry download audit joined to verified industry accounts.</li>
        </ul>
      </article>
    </section>
  );
}
