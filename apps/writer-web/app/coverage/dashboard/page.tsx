"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import type { CoverageProvider, CoverageOrder } from "@script-manifest/contracts";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { getAuthHeaders, readStoredSession } from "../../lib/authSession";

type Tab = "incoming" | "active" | "completed";

export default function ProviderDashboardPage() {
  const toast = useToast();
  const [signedInUserId, setSignedInUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<CoverageProvider | null>(null);
  const [orders, setOrders] = useState<CoverageOrder[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("incoming");

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check if user has a provider profile
      const providerRes = await fetch("/api/v1/coverage/providers", {
        headers: getAuthHeaders(),
        cache: "no-store"
      });

      if (providerRes.ok) {
        const providerBody = (await providerRes.json()) as { providers?: CoverageProvider[] };
        const userProvider = providerBody.providers?.find((p) => p.userId === signedInUserId);
        setProvider(userProvider ?? null);

        if (userProvider) {
          // Load orders for this provider
          const ordersRes = await fetch(`/api/v1/coverage/orders?providerId=${encodeURIComponent(userProvider.id)}`, {
            headers: getAuthHeaders(),
            cache: "no-store"
          });

          if (ordersRes.ok) {
            const ordersBody = (await ordersRes.json()) as { orders?: CoverageOrder[] };
            setOrders(ordersBody.orders ?? []);
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [signedInUserId, toast]);

  useEffect(() => {
    if (signedInUserId) {
      void loadData();
    }
  }, [signedInUserId, loadData]);

  async function handleClaim(orderId: string) {
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/claim`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to claim order.");
        return;
      }

      toast.success("Order claimed!");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim order.");
    }
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      payment_held: "border-amber-300 bg-amber-50 text-amber-700",
      claimed: "border-tide-500/30 bg-tide-500/10 text-tide-700",
      in_progress: "border-blue-300 bg-blue-50 text-blue-700",
      delivered: "border-violet-300 bg-violet-50 text-violet-700",
      completed: "border-green-300 bg-green-50 text-green-700"
    };
    return colors[status] ?? "border-ink-500/20 bg-ink-500/10 text-ink-700";
  }

  const incomingOrders = orders.filter((o) => o.status === "payment_held");
  const activeOrders = orders.filter((o) => o.status === "claimed" || o.status === "in_progress");
  const completedOrders = orders.filter((o) => o.status === "completed");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "incoming", label: "Incoming", count: incomingOrders.length },
    { key: "active", label: "Active", count: activeOrders.length },
    { key: "completed", label: "Completed", count: completedOrders.length }
  ];

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  if (!provider) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Coverage Provider Dashboard</p>
          <h1 className="text-4xl text-ink-900">Become a provider</h1>
          <p className="max-w-3xl text-ink-700">
            Join our marketplace and offer professional script coverage services to writers.
          </p>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
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
        <h1 className="text-4xl text-ink-900">{provider.displayName}</h1>
        <p className="max-w-3xl text-ink-700">Manage your orders and track your performance.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="rounded-lg border border-ink-500/15 bg-white px-4 py-2">
            <span className="text-xs text-ink-500">Total Orders</span>
            <p className="text-2xl font-semibold text-ink-900">{provider.totalOrdersCompleted}</p>
          </div>
          <div className="rounded-lg border border-ink-500/15 bg-white px-4 py-2">
            <span className="text-xs text-ink-500">Avg Rating</span>
            <p className="text-2xl font-semibold text-ink-900">
              {provider.avgRating !== null ? provider.avgRating.toFixed(1) : "N/A"}
            </p>
          </div>
          <div className="rounded-lg border border-ink-500/15 bg-white px-4 py-2">
            <span className="text-xs text-ink-500">Active Orders</span>
            <p className="text-2xl font-semibold text-ink-900">{activeOrders.length}</p>
          </div>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <nav className="flex gap-2 border-b border-ink-500/15 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                activeTab === tab.key
                  ? "rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-xs font-semibold text-ember-700"
                  : "rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-500/20 hover:bg-cream-100"
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>

        {activeTab === "incoming" ? (
          incomingOrders.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
              title="No incoming orders"
              description="New orders awaiting claim will appear here."
            />
          ) : (
            <div className="stack">
              {incomingOrders.map((order) => (
                <article key={order.id} className="subcard">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-tight flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-ink-900">Order {order.id}</strong>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge">{formatPrice(order.providerPayoutCents)}</span>
                        {order.slaDeadline ? (
                          <span className="text-xs text-ink-500">
                            Due: {new Date(order.slaDeadline).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleClaim(order.id)}
                        >
                          Claim Order
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : activeTab === "active" ? (
          activeOrders.length === 0 ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
              title="No active orders"
              description="Orders you've claimed will appear here."
            />
          ) : (
            <div className="stack">
              {activeOrders.map((order) => (
                <article key={order.id} className="subcard">
                  <div className="flex items-start justify-between gap-3">
                    <div className="stack-tight flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-ink-900">Order {order.id}</strong>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge">{formatPrice(order.providerPayoutCents)}</span>
                        {order.slaDeadline ? (
                          <span className="text-xs text-ink-500">
                            Due: {new Date(order.slaDeadline).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <a
                          href={`/coverage/orders/${encodeURIComponent(order.id)}`}
                          className="btn btn-secondary no-underline"
                        >
                          View Order
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : completedOrders.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No completed orders"
            description="Your completed orders will appear here."
          />
        ) : (
          <div className="stack">
            {completedOrders.map((order) => (
              <article key={order.id} className="subcard">
                <div className="flex items-start justify-between gap-3">
                  <div className="stack-tight flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-ink-900">Order {order.id}</strong>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge">{formatPrice(order.providerPayoutCents)}</span>
                      {order.deliveredAt ? (
                        <span className="text-xs text-ink-500">
                          Delivered: {new Date(order.deliveredAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
