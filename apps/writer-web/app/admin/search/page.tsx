"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { fetcher, ApiError } from "../../lib/fetcher";
import { useToast } from "../../components/toast";
import { SkeletonCard } from "../../components/skeleton";

type SearchStatus = {
  backend: string;
  searchHealth: string;
  documentCount: number;
  indexSizeBytes: number | null;
  lastSyncAt: string | null;
  notes: string[];
};

type RefreshResponse = {
  message: string;
  type: string;
  status: string;
};

const healthColors: Record<string, string> = {
  ready: "border-green-300 dark:border-green-400/45 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  degraded: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  unknown: "border-border/65 bg-ink-500/10 text-muted"
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const STATUS_KEY = "/api/v1/admin/search/status";

async function reindexFetcher(_key: string): Promise<RefreshResponse> {
  return fetcher<RefreshResponse>("/api/v1/admin/search/reindex", { method: "POST" });
}

export default function SearchAdminPage() {
  const toast = useToast();

  const { data: status, error, isLoading } = useSWR<SearchStatus>(STATUS_KEY);
  const { trigger: triggerReindex, isMutating: refreshing } = useSWRMutation(
    STATUS_KEY,
    reindexFetcher
  );

  async function handleRefresh() {
    try {
      const result = await triggerReindex();
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to refresh search metadata.");
    }
  }

  const healthColor = status
    ? healthColors[status.searchHealth] ?? healthColors.unknown!
    : healthColors.unknown!;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Competition Search</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Search is powered by PostgreSQL full-text search. No separate search cluster is required.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Search Status</h2>
        {isLoading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof ApiError ? error.message : "Unable to load search status. Check your connection and permissions."}
          </p>
        ) : status ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger">
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase ${healthColor}`}>
                {status.searchHealth}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted mt-1">
                Search Health
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {status.documentCount.toLocaleString()}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                Indexed Competitions
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-3xl font-bold tabular-nums text-foreground">
                {status.indexSizeBytes != null ? formatBytes(status.indexSizeBytes) : "N/A"}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                Index Size
              </span>
            </div>
            <div className="subcard flex flex-col items-center gap-1 py-5 text-center">
              <span className="text-sm font-mono text-foreground-secondary">
                {status.backend}
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted mt-1">
                Backend
              </span>
            </div>
          </div>
        ) : (
          <p className="empty-state">Unable to load search status. Check your connection and permissions.</p>
        )}

        {status?.notes && status.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-foreground-secondary">
            {status.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted">{">"}</span>
                {note}
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Maintenance</h2>
        <p className="text-sm text-foreground-secondary">
          The search index is automatically maintained via PostgreSQL generated columns. Manual reindexing is not required.
        </p>
        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={refreshing}
            onClick={() => { void handleRefresh(); }}
          >
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
      </article>
    </section>
  );
}
