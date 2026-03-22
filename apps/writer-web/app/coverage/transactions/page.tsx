"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "../../lib/authSession";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";

interface TransactionItem {
  id: string;
  createdAt: string;
  status: string;
  priceCents: number;
  serviceName: string;
  receiptUrl: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "border-green-300 bg-green-500/10 text-green-700 dark:text-green-400",
  payment_failed: "border-red-400/60 bg-red-500/10 text-red-700 dark:text-red-300",
  payment_held: "border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-500",
  in_progress: "border-blue-300 bg-blue-50 text-blue-700",
  claimed: "border-tide-500/30 bg-tide-500/10 text-tide-700 dark:text-tide-500",
  delivered: "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  cancelled: "border-border/65 bg-ink-500/10 text-muted",
  refunded: "border-border/65 bg-ink-500/10 text-muted",
  placed: "border-border/65 bg-ink-500/10 text-foreground-secondary",
  disputed: "border-red-400/60 bg-red-500/10 text-red-700 dark:text-red-300",
};

const PAGE_SIZE = 10;

export default function TransactionsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadTransactions = useCallback(async (nextOffset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const qs = `?limit=${PAGE_SIZE}&offset=${nextOffset}`;
      const res = await fetch(`/api/v1/coverage/my-orders${qs}`, {
        headers: {},
        cache: "no-store"
      });
      if (res.ok) {
        const body = await res.json() as { orders?: TransactionItem[] };
        const items = body.orders ?? [];
        if (replace) {
          setTransactions(items);
        } else {
          setTransactions(prev => [...prev, ...items]);
        }
        setOffset(nextOffset + items.length);
        setHasMore(items.length === PAGE_SIZE);
      }
    } catch {
      toast.error("Failed to load transactions.");
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadTransactions(0, true);
  }, [loadTransactions]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatAmount(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  if (loading) {
    return <section className="space-y-4"><SkeletonCard /></section>;
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Coverage</p>
        <h1 className="text-4xl text-foreground">Transaction History</h1>
        <p className="max-w-3xl text-foreground-secondary">
          View your past coverage orders and download receipts.
        </p>
      </article>

      {transactions.length === 0 ? (
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
          title="No transactions yet"
          description="Browse coverage services to get started."
          actionLabel="Browse coverage services"
          actionHref="/coverage"
        />
      ) : (
        <article className="panel stack animate-in">
          <h2 className="section-title">Orders</h2>
          <div className="stack">
            {transactions.map(tx => (
              <div key={tx.id} className="subcard flex items-center justify-between gap-4">
                <div className="stack-tight flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.serviceName}</p>
                  <p className="text-xs text-foreground-secondary">{formatDate(tx.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-medium text-foreground">{formatAmount(tx.priceCents)}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${STATUS_COLORS[tx.status] ?? STATUS_COLORS.placed}`}>
                    {tx.status.replace(/_/g, " ")}
                  </span>
                  {tx.receiptUrl ? (
                    <a
                      href={tx.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ember-500 hover:underline"
                    >
                      Invoice
                    </a>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void loadTransactions(offset, false)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
