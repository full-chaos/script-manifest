"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SkeletonCard } from "../../components/skeleton";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";

type AuditLogEntry = {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

type AuditLogResponse = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
};

const TARGET_TYPES = [
  "all",
  "user",
  "competition",
  "dispute",
  "provider",
  "content",
  "ranking",
  "flag",
  "appeal"
] as const;

const PAGE_LIMIT = 50;

function formatAction(action: string): string {
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function entriesToCsv(entries: AuditLogEntry[]): string {
  const header = "timestamp,action,targetType,targetId,adminUserId,details";
  const rows = entries.map((entry) => {
    const timestamp = new Date(entry.createdAt).toLocaleString();
    const details = entry.details ? JSON.stringify(entry.details).replace(/"/g, '""') : "";
    return [
      `"${timestamp}"`,
      `"${entry.action}"`,
      `"${entry.targetType}"`,
      `"${entry.targetId}"`,
      `"${entry.adminUserId}"`,
      `"${details}"`
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminAuditLogPage() {
  const toast = useToast();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("all");
  const [adminUserIdFilter, setAdminUserIdFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const mounted = useRef(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchEntries = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (actionFilter.trim()) params.set("action", actionFilter.trim());
        if (targetTypeFilter !== "all") params.set("targetType", targetTypeFilter);
        if (adminUserIdFilter.trim()) params.set("adminUserId", adminUserIdFilter.trim());
        params.set("page", String(targetPage));
        params.set("limit", String(PAGE_LIMIT));

        const response = await fetch(`/api/v1/admin/audit-log?${params.toString()}`, {
          headers: { ...getAuthHeaders() },
          cache: "no-store"
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = (body as { error?: string }).error ?? "Failed to load audit log.";
          toast.error(message);
          return;
        }

        const body = (await response.json()) as AuditLogResponse;
        setEntries(body.entries);
        setTotal(body.total);
        setPage(body.page);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Network error loading audit log.");
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, targetTypeFilter, adminUserIdFilter, toast]
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void fetchEntries(1);
    }
  }, [fetchEntries]);

  function handleApplyFilters() {
    setPage(1);
    void fetchEntries(1);
  }

  function handlePrevious() {
    if (page > 1) {
      void fetchEntries(page - 1);
    }
  }

  function handleNext() {
    if (page < totalPages) {
      void fetchEntries(page + 1);
    }
  }

  function handleExportCsv() {
    if (entries.length === 0) {
      toast.info("No entries to export.");
      return;
    }
    downloadCsv(entriesToCsv(entries));
    toast.success(`Exported ${entries.length} entries to CSV.`);
  }

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin Oversight</p>
        <h1 className="text-4xl text-foreground">Audit log</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review all administrative actions across the platform. Filter by action, target, or admin
          user to investigate specific activity.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Filters</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="stack-tight">
            <span className="text-sm text-foreground-secondary">Action</span>
            <input
              className="input"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              placeholder="e.g. suspend_user"
            />
          </label>

          <label className="stack-tight">
            <span className="text-sm text-foreground-secondary">Target type</span>
            <select
              className="input"
              value={targetTypeFilter}
              onChange={(event) => setTargetTypeFilter(event.target.value)}
            >
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "All types" : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="stack-tight">
            <span className="text-sm text-foreground-secondary">Admin user ID</span>
            <input
              className="input"
              value={adminUserIdFilter}
              onChange={(event) => setAdminUserIdFilter(event.target.value)}
              placeholder="e.g. admin_01"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApplyFilters}
            disabled={loading}
          >
            {loading ? "Loading..." : "Apply filters"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCsv}
            disabled={loading || entries.length === 0}
          >
            Export CSV (current page)
          </button>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <div className="flex items-center justify-between">
          <h2 className="section-title">
            Entries{" "}
            <span className="text-sm font-normal text-muted">
              ({total} total)
            </span>
          </h2>
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrevious}
              disabled={loading || page <= 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNext}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-16 w-16 text-muted" />}
            title="No audit log entries found"
            description="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <article key={entry.id} className="subcard">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{formatAction(entry.action)}</span>
                    <span className="text-sm text-foreground-secondary">
                      {entry.targetType}
                    </span>
                    <span className="text-sm font-mono text-muted" title="Target ID">
                      {entry.targetId}
                    </span>
                  </div>
                  <time
                    className="shrink-0 text-xs text-muted"
                    dateTime={entry.createdAt}
                    title={entry.createdAt}
                  >
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-foreground-secondary">
                  <span>
                    Admin: <span className="font-mono">{entry.adminUserId}</span>
                  </span>
                  {entry.ipAddress ? (
                    <span>
                      IP: <span className="font-mono">{entry.ipAddress}</span>
                    </span>
                  ) : null}
                </div>

                {entry.details ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground-secondary underline hover:text-foreground"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      {expandedId === entry.id ? "Hide details" : "Show details"}
                    </button>
                    {expandedId === entry.id ? (
                      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-background-secondary p-3 text-xs text-foreground-secondary">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {!loading && entries.length > 0 ? (
          <div className="flex items-center justify-end gap-2 pt-2 text-sm text-foreground-secondary">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrevious}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNext}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
