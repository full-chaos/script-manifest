"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";
import { SkeletonCard } from "../../components/skeleton";

type IndexStatus = {
  clusterHealth: string;
  indexName: string;
  documentCount: number;
  indexSizeBytes: number;
  lastSyncAt: string | null;
};

type ReindexResponse = {
  jobId: string;
  type: string;
  status: string;
  startedAt: string;
};

const healthColors: Record<string, string> = {
  green: "border-green-300 dark:border-green-400/45 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  yellow: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  red: "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  unknown: "border-border/65 bg-ink-500/10 text-muted"
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function SearchAdminPage() {
  const toast = useToast();
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/search/status", {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to load search status.");
        return;
      }
      const body = (await response.json()) as IndexStatus;
      setStatus(body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load search status.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleReindex = useCallback(async (type?: string) => {
    setReindexing(true);
    try {
      const url = type
        ? `/api/v1/admin/search/reindex/${encodeURIComponent(type)}`
        : "/api/v1/admin/search/reindex";
      const response = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to start reindex.");
        return;
      }
      const body = (await response.json()) as ReindexResponse;
      toast.success(`Reindex started (job: ${body.jobId.slice(0, 12)}...)`);
      // Refresh status after a short delay
      setTimeout(() => { void loadStatus(); }, 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start reindex.");
    } finally {
      setReindexing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);

  const healthColor = status
    ? healthColors[status.clusterHealth] ?? healthColors.unknown
    : healthColors.unknown;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Search Index</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Monitor OpenSearch cluster health, document counts, and trigger reindexing operations.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Index Status</h2>
        {loading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : status ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger">
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase ${healthColor}`}>
                {status.clusterHealth}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted mt-1">
                Cluster Health
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {status.documentCount.toLocaleString()}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                Documents
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {formatBytes(status.indexSizeBytes)}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                Index Size
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-sm font-mono text-foreground-secondary">
                {status.indexName}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted mt-1">
                Index Name
              </span>
            </div>
          </div>
        ) : (
          <p className="empty-state">Unable to load index status. Check your connection and permissions.</p>
        )}
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Reindex Operations</h2>
        <p className="text-sm text-foreground-secondary">
          Trigger a full reindex or reindex specific document types. This will delete and recreate the search index.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={reindexing}
            onClick={() => { void handleReindex(); }}
          >
            {reindexing ? "Reindexing..." : "Reindex All"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={reindexing}
            onClick={() => { void handleReindex("competitions"); }}
          >
            {reindexing ? "Reindexing..." : "Reindex Competitions"}
          </button>
        </div>
      </article>
    </section>
  );
}
