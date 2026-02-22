"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { CoverageService, CoverageOrder } from "@script-manifest/contracts";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { SkeletonCard } from "../../../components/skeleton";
import { useToast } from "../../../components/toast";
import { getAuthHeaders, readStoredSession } from "../../../lib/authSession";

export default function OrderFlowPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;
  const toast = useToast();
  const [signedInUserId, setSignedInUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [service, setService] = useState<CoverageService | null>(null);
  const [scriptId, setScriptId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<CoverageOrder | null>(null);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
    }
  }, []);

  const loadService = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/coverage/services?limit=100`, { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { services?: CoverageService[] };
        const foundService = body.services?.find((s) => s.id === serviceId);
        setService(foundService ?? null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load service details.");
    } finally {
      setLoading(false);
    }
  }, [serviceId, toast]);

  useEffect(() => {
    void loadService();
  }, [loadService]);

  async function handlePlaceOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) return;

    setPlacing(true);
    try {
      const response = await fetch("/api/v1/coverage/orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ serviceId, scriptId, projectId })
      });

      const body = (await response.json()) as { order?: CoverageOrder; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to place order.");
        return;
      }

      setOrder(body.order ?? null);
      toast.success("Order placed successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to place order.");
    } finally {
      setPlacing(false);
    }
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTier(tier: string): string {
    return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
      </section>
    );
  }

  if (!service) {
    return (
      <section className="space-y-4">
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
          title="Service not found"
          description="The service you're looking for doesn't exist or has been removed."
        />
      </section>
    );
  }

  if (order) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Order Placed</p>
          <h1 className="text-4xl text-ink-900">Order confirmed</h1>
          <p className="max-w-3xl text-ink-700">
            Your order has been placed successfully. Payment is being processed.
          </p>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <h2 className="section-title">Order Details</h2>
          <div className="subcard">
            <div className="stack-tight">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-700">Order ID</span>
                <span className="text-sm font-medium text-ink-900">{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-700">Total</span>
                <span className="text-sm font-medium text-ink-900">
                  {formatPrice(order.priceCents + order.platformFeeCents)}
                </span>
              </div>
              {order.stripePaymentIntentId ? (
                <div className="mt-2 pt-2 border-t border-ink-500/10">
                  <p className="text-xs text-ink-500">
                    Stripe Payment Intent: {order.stripePaymentIntentId}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">
                    Note: Real Stripe Elements UI will be added later. For now, payment is automatically held.
                  </p>
                </div>
              ) : null}
              <div className="mt-3">
                <a
                  href={`/coverage/orders/${encodeURIComponent(order.id)}`}
                  className="btn btn-primary no-underline"
                >
                  View Order
                </a>
              </div>
            </div>
          </div>
        </article>
      </section>
    );
  }

  const platformFee = Math.round(service.priceCents * 0.15);
  const total = service.priceCents + platformFee;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Order Coverage</p>
        <h1 className="text-4xl text-ink-900">{service.title}</h1>
        {service.description ? <p className="max-w-3xl text-ink-700">{service.description}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="badge">{formatTier(service.tier)}</span>
          <span className="badge">{service.turnaroundDays}d turnaround</span>
          <span className="badge">Up to {service.maxPages} pages</span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Price Breakdown</h2>
        <div className="subcard">
          <div className="stack-tight">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-700">Service price</span>
              <span className="text-sm font-medium text-ink-900">{formatPrice(service.priceCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-700">Platform fee (15%)</span>
              <span className="text-sm font-medium text-ink-900">{formatPrice(platformFee)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-ink-500/10">
              <span className="text-base font-semibold text-ink-900">Total</span>
              <span className="text-base font-semibold text-ink-900">{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Order Form</h2>
        <form className="stack" onSubmit={handlePlaceOrder}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Script ID</span>
            <input
              className="input"
              type="text"
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              placeholder="script_abc123"
            />
            <span className="text-xs text-ink-500">
              The ID of the script you want coverage for (optional)
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Project ID</span>
            <input
              className="input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="proj_abc123"
            />
            <span className="text-xs text-ink-500">
              The ID of the project this coverage is for (optional)
            </span>
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={placing || !signedInUserId}>
              {placing ? "Placing order..." : signedInUserId ? "Place Order" : "Sign in to place order"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
