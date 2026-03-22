"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CoverageDispute, CoverageDisputeStatus } from "@script-manifest/contracts";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";
import { Modal } from "../../components/modal";

export default function AdminDisputesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [disputes, setDisputes] = useState<CoverageDispute[]>([]);
  const [resolvingDispute, setResolvingDispute] = useState<CoverageDispute | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"resolved_refund" | "resolved_no_refund" | "resolved_partial">("resolved_no_refund");
  const [adminNotes, setAdminNotes] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/coverage/disputes", {
        headers: {},
        cache: "no-store"
      });

      if (response.ok) {
        const body = (await response.json()) as { disputes?: CoverageDispute[] };
        setDisputes(body.disputes ?? []);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load disputes.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes]);

  async function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resolvingDispute) return;

    setSubmitting(true);
    try {
      const body: { status: typeof resolveStatus; adminNotes: string; refundAmountCents?: number } = {
        status: resolveStatus,
        adminNotes
      };

      if (resolveStatus === "resolved_partial" && refundAmount) {
        body.refundAmountCents = Math.round(Number(refundAmount) * 100);
      }

      const response = await fetch(`/api/v1/coverage/disputes/${encodeURIComponent(resolvingDispute.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify(body)
      });

      const responseBody = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(responseBody.error ?? "Failed to resolve dispute.");
        return;
      }

      toast.success("Dispute resolved!");
      setResolvingDispute(null);
      setResolveStatus("resolved_no_refund");
      setAdminNotes("");
      setRefundAmount("");
      await loadDisputes();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve dispute.");
    } finally {
      setSubmitting(false);
    }
  }

  function openResolveModal(dispute: CoverageDispute) {
    setResolvingDispute(dispute);
    setResolveStatus("resolved_no_refund");
    setAdminNotes("");
    setRefundAmount("");
  }

  function getStatusColor(status: CoverageDisputeStatus): string {
    const colors: Record<CoverageDisputeStatus, string> = {
      open: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
      under_review: "border-blue-300 bg-blue-50 text-blue-700",
      resolved_refund: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
      resolved_no_refund: "border-border/65 bg-ink-500/10 text-foreground-secondary",
      resolved_partial: "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500"
    };
    return colors[status] ?? colors.open;
  }

  function formatReason(reason: string): string {
    return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl text-foreground">Dispute Management</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review and resolve disputes between writers and coverage providers.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">All Disputes</h2>
        {loading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : disputes.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="No disputes"
            description="There are no disputes to review at this time."
          />
        ) : (
          <div className="stack">
            {disputes.map((dispute) => (
              <article key={dispute.id} className="subcard">
                <div className="stack-tight">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-foreground">Order {dispute.orderId}</strong>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(dispute.status)}`}>
                          {dispute.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="badge">{formatReason(dispute.reason)}</span>
                        <span className="text-xs text-muted">
                          Opened: {new Date(dispute.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {dispute.description ? (
                        <p className="mt-2 text-sm text-foreground-secondary">{dispute.description}</p>
                      ) : null}
                      {dispute.adminNotes ? (
                        <div className="mt-2 rounded-lg border border-border/55 bg-background p-2">
                          <strong className="text-xs text-foreground">Admin Notes:</strong>
                          <p className="text-xs text-foreground-secondary">{dispute.adminNotes}</p>
                        </div>
                      ) : null}
                      {dispute.refundAmountCents !== null ? (
                        <p className="mt-2 text-xs text-foreground-secondary">
                          Refund: ${(dispute.refundAmountCents / 100).toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {dispute.status === "open" || dispute.status === "under_review" ? (
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openResolveModal(dispute)}
                      >
                        Resolve Dispute
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      <Modal
        open={resolvingDispute !== null}
        onClose={() => setResolvingDispute(null)}
        title="Resolve Dispute"
      >
        <form className="stack" onSubmit={handleResolve}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Resolution</span>
            <select
              className="input"
              value={resolveStatus}
              onChange={(e) => setResolveStatus(e.target.value as typeof resolveStatus)}
            >
              <option value="resolved_refund">Full Refund</option>
              <option value="resolved_no_refund">No Refund</option>
              <option value="resolved_partial">Partial Refund</option>
            </select>
          </label>
          {resolveStatus === "resolved_partial" ? (
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground">Refund Amount ($)</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.01}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
          ) : null}
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Admin Notes</span>
            <textarea
              className="input min-h-32"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Explanation of the resolution..."
              maxLength={5000}
              required
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Resolving..." : "Resolve Dispute"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
