"use client";

import { useState } from "react";
import type { Route } from "next";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { CoverageProvider, CoverageOrder } from "@script-manifest/contracts";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { useAuth } from "../../lib/AuthProvider";
import { fetcher, ApiError } from "../../lib/fetcher";

type Tab = "incoming" | "active" | "completed";

async function claimOrder(
  _key: string,
  { arg }: { arg: string }
): Promise<{ order: CoverageOrder }> {
  return fetcher<{ order: CoverageOrder }>(
    `/api/v1/coverage/orders/${encodeURIComponent(arg)}/claim`,
    { method: "POST" }
  );
}

export default function ProviderDashboardPage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("incoming");

  // Auth-paused: do not fetch until auth resolves and user is known
  const providersKey = authLoading || !userId ? null : "/api/v1/coverage/providers";

  const { data: providersData, isLoading: providersLoading } = useSWR<{ providers: CoverageProvider[] }>(
    providersKey,
    fetcher,
    {
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to load dashboard data.");
      },
    }
  );

  const userProvider = providersData?.providers?.find((p) => p.userId === userId) ?? null;

  const ordersKey = userProvider
    ? `/api/v1/coverage/orders?providerId=${encodeURIComponent(userProvider.id)}`
    : null;

  const { data: ordersData, isLoading: ordersLoading, mutate: mutateOrders } = useSWR<{ orders: CoverageOrder[] }>(
    ordersKey,
    fetcher
  );

  const { trigger: triggerClaim } = useSWRMutation(ordersKey, claimOrder, {
    throwOnError: false,
    onSuccess() {
      toast.success("Order claimed!");
    },
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to claim order.");
    },
  });

  async function handleClaim(orderId: string) {
    await triggerClaim(orderId);
    void mutateOrders();
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      payment_held: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
      claimed: "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500",
      in_progress: "border-blue-300 bg-blue-50 text-blue-700",
      delivered: "border-violet-400/60 dark:border-violet-300/45 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
      completed: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400"
    };
    return colors[status] ?? "border-border/65 bg-ink-500/10 text-foreground-secondary";
  }

  const orders = ordersData?.orders ?? [];
  const incomingOrders = orders.filter((o) => o.status === "payment_held");
  const activeOrders = orders.filter((o) => o.status === "claimed" || o.status === "in_progress");
  const completedOrders = orders.filter((o) => o.status === "completed");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "incoming", label: "Incoming", count: incomingOrders.length },
    { key: "active", label: "Active", count: activeOrders.length },
    { key: "completed", label: "Completed", count: completedOrders.length }
  ];

  const isLoading = authLoading || providersLoading || (!!userProvider && ordersLoading);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  if (!userProvider) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Coverage Provider Dashboard</p>
          <h1 className="text-4xl text-foreground">Become a provider</h1>
          <p className="max-w-3xl text-foreground-secondary">
            Join our marketplace and offer professional script coverage services to writers.
          </p>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="Not a provider yet"
            description="Register as a coverage provider to start accepting orders."
            actionLabel="Become a Provider"
            actionHref={"/coverage/become-provider" as Route}
          />
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Coverage Provider Dashboard</p>
        <h1 className="text-4xl text-foreground">{userProvider.displayName}</h1>
        <p className="max-w-3xl text-foreground-secondary">Manage your orders and track your performance.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="rounded-lg border border-border/55 bg-surface px-4 py-2">
            <span className="text-xs text-muted">Total Orders</span>
            <p className="text-2xl font-semibold text-foreground">{userProvider.totalOrdersCompleted}</p>
          </div>
          <div className="rounded-lg border border-border/55 bg-surface px-4 py-2">
            <span className="text-xs text-muted">Avg Rating</span>
            <p className="text-2xl font-semibold text-foreground">
              {userProvider.avgRating !== null ? userProvider.avgRating.toFixed(1) : "N/A"}
            </p>
          </div>
          <div className="rounded-lg border border-border/55 bg-surface px-4 py-2">
            <span className="text-xs text-muted">Active Orders</span>
            <p className="text-2xl font-semibold text-foreground">{activeOrders.length}</p>
          </div>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <nav className="flex gap-2 border-b border-border/55 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                activeTab === tab.key
                  ? "rounded-md border border-primary/45 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary-dark dark:text-primary"
                  : "rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-foreground-secondary hover:border-border/65 hover:bg-background-secondary"
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>

        {activeTab === "incoming" && (
          incomingOrders.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
              title="No incoming orders"
              description="New orders awaiting your acceptance will appear here."
            />
          ) : (
            <div className="stack">
              {incomingOrders.map((order) => (
                <div key={order.id} className="subcard">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-tight flex-1">
                      <p className="text-sm font-medium text-foreground">Order {order.id}</p>
                      <p className="text-xs text-foreground-secondary">{formatPrice(order.priceCents)}</p>
                      <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary shrink-0"
                      onClick={() => void handleClaim(order.id)}
                    >
                      Claim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "active" && (
          activeOrders.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
              title="No active orders"
              description="Orders you have claimed and are working on will appear here."
            />
          ) : (
            <div className="stack">
              {activeOrders.map((order) => (
                <div key={order.id} className="subcard">
                  <div className="stack-tight">
                    <p className="text-sm font-medium text-foreground">Order {order.id}</p>
                    <p className="text-xs text-foreground-secondary">{formatPrice(order.priceCents)}</p>
                    <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                    <a href={`/coverage/orders/${encodeURIComponent(order.id)}`} className="text-sm text-primary hover:underline">
                      View Order
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "completed" && (
          completedOrders.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
              title="No completed orders"
              description="Orders you have delivered and been reviewed will appear here."
            />
          ) : (
            <div className="stack">
              {completedOrders.map((order) => (
                <div key={order.id} className="subcard">
                  <div className="stack-tight">
                    <p className="text-sm font-medium text-foreground">Order {order.id}</p>
                    <p className="text-xs text-foreground-secondary">{formatPrice(order.priceCents)}</p>
                    <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </article>
    </section>
  );
}
