"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { fetcher, ApiError } from "../../lib/fetcher";
import { useToast } from "../../components/toast";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";

// ── Types ───────────────────────────────────────────────────────

type NotificationTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  category: string;
  createdBy: string;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type NotificationBroadcast = {
  id: string;
  templateId: string | null;
  subject: string;
  body: string;
  audience: string;
  sentBy: string;
  recipientCount: number;
  status: "pending" | "sending" | "sent" | "failed";
  sentAt: string | null;
  createdAt: string;
};

type AudienceType = "all" | "role" | "user";

// ── Status badge styles ─────────────────────────────────────────

const templateStatusColors: Record<NotificationTemplate["status"], string> = {
  draft: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  active: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  archived: "border-border/65 bg-ink-500/10 text-foreground-secondary"
};

const broadcastStatusColors: Record<NotificationBroadcast["status"], string> = {
  pending: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  sending: "border-blue-400/60 dark:border-blue-300/45 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400",
  sent: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  failed: "border-red-300 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300"
};

const categoryLabels: Record<string, string> = {
  system_maintenance: "System Maintenance",
  new_feature: "New Feature",
  policy_update: "Policy Update",
  general: "General"
};

const HISTORY_LIMIT = 20;

// ── Cache keys ──────────────────────────────────────────────────

const TEMPLATES_KEY = "/api/v1/admin/notifications/templates";

function buildHistoryKey(page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(HISTORY_LIMIT)
  });
  return `/api/v1/admin/notifications/history?${params.toString()}`;
}

// ── Mutation fetchers ───────────────────────────────────────────

type SendArg =
  | { type: "direct"; userId: string; subject: string; body: string }
  | { type: "broadcast"; subject: string; body: string; audience: string };

async function sendFetcher(
  _key: string,
  { arg }: { arg: SendArg }
): Promise<{ message: string }> {
  if (arg.type === "direct") {
    return fetcher<{ message: string }>("/api/v1/admin/notifications/direct", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: arg.userId, subject: arg.subject, body: arg.body })
    });
  }
  return fetcher<{ message: string }>("/api/v1/admin/notifications/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject: arg.subject, body: arg.body, audience: arg.audience })
  });
}

// ── Component ───────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const toast = useToast();

  // ── Compose state ───────────────────────────────────────────
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [roleValue, setRoleValue] = useState("admin");
  const [userIdValue, setUserIdValue] = useState("");

  // ── History pagination state ─────────────────────────────────
  const [historyPage, setHistoryPage] = useState(1);

  // ── SWR reads ────────────────────────────────────────────────

  const { data: templatesData, error: templatesError, isLoading: templatesLoading } =
    useSWR<{ templates: NotificationTemplate[] }>(TEMPLATES_KEY);
  const templates = templatesData?.templates ?? [];

  const historyKey = buildHistoryKey(historyPage);
  const { data: historyData, error: historyError, isLoading: historyLoading } =
    useSWR<{ broadcasts: NotificationBroadcast[]; total: number }>(historyKey);
  const broadcasts = historyData?.broadcasts ?? [];
  const historyTotal = historyData?.total ?? 0;

  // ── Mutations ─────────────────────────────────────────────────

  const { trigger: triggerSend, isMutating: sending } = useSWRMutation(
    buildHistoryKey(1),
    sendFetcher
  );

  // ── Handlers ─────────────────────────────────────────────────

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      let arg: SendArg;
      if (audienceType === "user") {
        arg = { type: "direct", userId: userIdValue, subject, body };
      } else {
        const audience = audienceType === "role" ? `role:${roleValue}` : "all";
        arg = { type: "broadcast", subject, body, audience };
      }

      await triggerSend(arg);

      if (audienceType === "user") {
        toast.success("Direct notification sent successfully.");
      } else {
        toast.success("Broadcast sent successfully.");
      }

      // Reset form and navigate to page 1 of history
      setSubject("");
      setBody("");
      setAudienceType("all");
      setUserIdValue("");
      setHistoryPage(1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send notification.");
    }
  }

  // ── Pagination ──────────────────────────────────────────────

  function handleHistoryPageChange(newPage: number) {
    setHistoryPage(newPage);
  }

  const hasMoreHistory = historyPage * HISTORY_LIMIT < historyTotal;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl text-foreground">Notification Management</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Compose and send notifications, manage templates, and view broadcast history.
        </p>
      </article>

      {/* ── Compose Section ──────────────────────────────────── */}
      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Compose Notification</h2>
        <form className="stack" onSubmit={handleSend}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Subject</span>
            <input
              type="text"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Notification subject..."
              maxLength={500}
              required
            />
          </label>

          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Body</span>
            <textarea
              className="input min-h-32"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your notification message..."
              maxLength={10000}
              required
            />
          </label>

          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Audience</span>
            <select
              className="input"
              value={audienceType}
              onChange={(e) => setAudienceType(e.target.value as AudienceType)}
            >
              <option value="all">All Users</option>
              <option value="role">By Role</option>
              <option value="user">Specific User</option>
            </select>
          </label>

          {audienceType === "role" ? (
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground">Role</span>
              <select
                className="input"
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="writer">Writer</option>
                <option value="partner">Partner</option>
                <option value="industry_professional">Industry Professional</option>
              </select>
            </label>
          ) : audienceType === "user" ? (
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground">User ID</span>
              <input
                type="text"
                className="input"
                value={userIdValue}
                onChange={(e) => setUserIdValue(e.target.value)}
                placeholder="user_abc123..."
                required
              />
            </label>
          ) : null}

          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Sending..." : "Send Notification"}
            </button>
          </div>
        </form>
      </article>

      {/* ── Templates Section ────────────────────────────────── */}
      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Templates</h2>
        {templatesLoading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : templatesError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {templatesError instanceof ApiError ? templatesError.message : "Failed to load templates."}
          </p>
        ) : templates.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
            title="No templates"
            description="No notification templates have been created yet."
          />
        ) : (
          <div className="stack">
            {templates.map((template) => (
              <article key={template.id} className="subcard">
                <div className="stack-tight">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{template.name}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${templateStatusColors[template.status]}`}>
                          {template.status}
                        </span>
                        <span className="badge">
                          {categoryLabels[template.category] ?? template.category}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-foreground-secondary">{template.subject}</p>
                      <p className="mt-1 text-xs text-muted">
                        Created: {new Date(template.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      {/* ── History Section ───────────────────────────────────── */}
      <article className="panel stack animate-in animate-in-delay-2">
        <div className="subcard-header">
          <h2 className="section-title">Broadcast History</h2>
          <span className="text-xs text-muted">
            {historyTotal} total &middot; Page {historyPage}
          </span>
        </div>

        {historyLoading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : historyError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {historyError instanceof ApiError ? historyError.message : "Failed to load broadcast history."}
          </p>
        ) : broadcasts.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
            title="No broadcasts"
            description="No notification broadcasts have been sent yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted">Subject</th>
                  <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted">Audience</th>
                  <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted">Recipients</th>
                  <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted">Status</th>
                  <th className="py-2 text-left text-xs font-medium uppercase tracking-[0.1em] text-muted">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((broadcast) => (
                  <tr key={broadcast.id} className="border-b border-border/20">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{broadcast.subject}</td>
                    <td className="py-2.5 pr-4">
                      <span className="badge">{broadcast.audience}</span>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-foreground-secondary">
                      {broadcast.recipientCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${broadcastStatusColors[broadcast.status]}`}>
                        {broadcast.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-muted">
                      {broadcast.sentAt ? new Date(broadcast.sentAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!historyLoading && broadcasts.length > 0 ? (
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={historyPage <= 1}
              onClick={() => handleHistoryPageChange(historyPage - 1)}
            >
              Previous
            </button>
            <span className="text-sm text-muted">Page {historyPage}</span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasMoreHistory}
              onClick={() => handleHistoryPageChange(historyPage + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
