"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { Modal } from "../../components/modal";

type ContentReport = {
  id: string;
  reporterId: string;
  contentType: "script" | "profile" | "review" | "feedback";
  contentId: string;
  reason: "harassment" | "hate_speech" | "plagiarism" | "spam" | "inappropriate" | "impersonation" | "other";
  description: string | null;
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  resolvedByUserId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
};

type ActionType = "warning" | "content_removal" | "suspension" | "ban";

type StatusFilter = "pending" | "reviewed" | "actioned" | "dismissed";
type ContentTypeFilter = "script" | "profile" | "review" | "feedback";

const statusColors: Record<ContentReport["status"], string> = {
  pending: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  reviewed: "border-blue-400/60 dark:border-blue-300/45 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400",
  actioned: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  dismissed: "border-border/65 bg-ink-500/10 text-foreground-secondary"
};

const contentTypeColors: Record<ContentReport["contentType"], string> = {
  script: "border-violet-400/60 dark:border-violet-300/45 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
  profile: "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500",
  review: "border-blue-400/60 dark:border-blue-300/45 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400",
  feedback: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500"
};

function formatReason(reason: string): string {
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const LIMIT = 20;

export default function AdminModerationPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter | "">("");

  // Action modal
  const [actionReport, setActionReport] = useState<ContentReport | null>(null);
  const [actionType, setActionType] = useState<ActionType>("warning");
  const [actionReason, setActionReason] = useState("");
  const [suspensionDays, setSuspensionDays] = useState("30");
  const [submitting, setSubmitting] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadReports = useCallback(async (targetPage: number) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(targetPage),
        limit: String(LIMIT)
      });
      if (contentTypeFilter) {
        params.set("contentType", contentTypeFilter);
      }

      const response = await fetch(`/api/v1/admin/moderation/queue?${params.toString()}`, {
        headers: {},
        cache: "no-store",
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (response.ok) {
        const body = (await response.json()) as { reports?: ContentReport[]; total?: number };
        const items = body.reports ?? [];
        setReports(items);
        setHasMore(items.length >= LIMIT);
      } else {
        const body = (await response.json()) as { error?: string };
        toast.error(body.error ?? "Failed to load moderation queue.");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Failed to load moderation queue.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [statusFilter, contentTypeFilter, toast]);

  useEffect(() => {
    setPage(1);
    void loadReports(1);
  }, [loadReports]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    void loadReports(newPage);
  }

  function openActionModal(report: ContentReport) {
    setActionReport(report);
    setActionType("warning");
    setActionReason("");
    setSuspensionDays("30");
  }

  async function handleSubmitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionReport) return;

    setSubmitting(true);
    try {
      const payload: { actionType: ActionType; reason: string; suspensionDays?: number } = {
        actionType,
        reason: actionReason
      };

      if (actionType === "suspension") {
        payload.suspensionDays = Number(suspensionDays);
      }

      const response = await fetch(`/api/v1/admin/moderation/${encodeURIComponent(actionReport.id)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify(payload)
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to submit action.");
        return;
      }

      toast.success("Action taken successfully.");
      setActionReport(null);
      await loadReports(page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit action.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl text-foreground">Content Moderation Queue</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review reported content, take action on violations, and maintain community standards.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Filters</h2>
        <div className="grid-two">
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Content Type</span>
            <select
              className="input"
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value as ContentTypeFilter | "")}
            >
              <option value="">All types</option>
              <option value="script">Script</option>
              <option value="profile">Profile</option>
              <option value="review">Review</option>
              <option value="feedback">Feedback</option>
            </select>
          </label>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <div className="subcard-header">
          <h2 className="section-title">Reports</h2>
          <span className="text-xs text-muted">Page {page}</span>
        </div>

        {loading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
            title="No reports found"
            description="There are no content reports matching the current filters."
          />
        ) : (
          <div className="stack">
            {reports.map((report) => (
              <article key={report.id} className="subcard">
                <div className="stack-tight">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${contentTypeColors[report.contentType]}`}>
                          {report.contentType}
                        </span>
                        <span className="badge">{formatReason(report.reason)}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${statusColors[report.status]}`}>
                          {report.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                        <span>Reporter: <span className="font-mono text-foreground-secondary">{report.reporterId}</span></span>
                        <span>Content: <span className="font-mono text-foreground-secondary">{report.contentId}</span></span>
                      </div>
                      {report.description ? (
                        <p className="mt-2 text-sm text-foreground-secondary">{report.description}</p>
                      ) : null}
                      {report.resolution ? (
                        <div className="mt-2 rounded-lg border border-border/55 bg-background p-2">
                          <strong className="text-xs text-foreground">Resolution:</strong>
                          <p className="text-xs text-foreground-secondary">{report.resolution}</p>
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-muted">
                        Reported: {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {report.status === "pending" ? (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openActionModal(report)}
                      >
                        Take Action
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && reports.length > 0 ? (
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              Previous
            </button>
            <span className="text-sm text-muted">Page {page}</span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasMore}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </article>

      <Modal
        open={actionReport !== null}
        onClose={() => setActionReport(null)}
        title="Take Action"
        description={actionReport ? `Report on ${actionReport.contentType} (${formatReason(actionReport.reason)})` : undefined}
      >
        <form className="stack" onSubmit={handleSubmitAction}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Action Type</span>
            <select
              className="input"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
            >
              <option value="warning">Warning</option>
              <option value="content_removal">Content Removal</option>
              <option value="suspension">Suspension</option>
              <option value="ban">Ban</option>
            </select>
          </label>
          {actionType === "suspension" ? (
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground">Suspension Duration</span>
              <select
                className="input"
                value={suspensionDays}
                onChange={(e) => setSuspensionDays(e.target.value)}
              >
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">365 days</option>
              </select>
            </label>
          ) : null}
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              className="input min-h-32"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Explain the reason for this action..."
              maxLength={5000}
              required
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Action"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
