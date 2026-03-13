"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { CoverageService, CoverageOrder } from "@script-manifest/contracts";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { SkeletonCard } from "../../../components/skeleton";
import { useToast } from "../../../components/toast";
import { getAuthHeaders, readStoredSession } from "../../../lib/authSession";
import { StripeProvider } from "../../components/StripeProvider";
import { PaymentForm } from "../../components/PaymentForm";

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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
    }
  }, []);

  const loadService = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/coverage/services/${encodeURIComponent(serviceId)}`, { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { service?: CoverageService } | CoverageService;
        const foundService = ("service" in body ? body.service : body) as CoverageService | undefined;
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

      const body = (await response.json()) as { order?: CoverageOrder; clientSecret?: string; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to place order.");
        return;
      }

      setOrder(body.order ?? null);
      if (body.clientSecret) {
        setClientSecret(body.clientSecret);
      }
      toast.success("Order placed! Please complete payment below.");
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
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
          title="Service not found"
          description="The service you're looking for doesn't exist or has been removed."
        />
      </section>
    );
  }

  if (order && clientSecret && !paymentConfirmed) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Complete Payment</p>
          <h1 className="text-4xl text-foreground">Enter payment details</h1>
          <p className="max-w-3xl text-foreground-secondary">
            Your order has been placed. Please enter your card details to complete payment.
          </p>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <h2 className="section-title">Order Summary</h2>
          <div className="subcard">
            <div className="stack-tight">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary">Order ID</span>
                <span className="text-sm font-medium text-foreground">{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary">Total</span>
                <span className="text-sm font-medium text-foreground">
                  {formatPrice(order.priceCents + order.platformFeeCents)}
                </span>
              </div>
            </div>
          </div>
        </article>

        <article className="panel stack animate-in animate-in-delay-2">
          <h2 className="section-title">Payment</h2>
          <StripeProvider clientSecret={clientSecret}>
            <PaymentForm
              clientSecret={clientSecret}
              onSuccess={() => {
                setPaymentConfirmed(true);
                toast.success("Payment confirmed successfully!");
              }}
            />
          </StripeProvider>
        </article>
      </section>
    );
  }

  if (order && (paymentConfirmed || !clientSecret)) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Order Placed</p>
          <h1 className="text-4xl text-foreground">
            {paymentConfirmed ? "Payment confirmed" : "Order confirmed"}
          </h1>
          <p className="max-w-3xl text-foreground-secondary">
            {paymentConfirmed
              ? "Your payment has been processed successfully. Your coverage provider will begin work shortly."
              : "Your order has been placed successfully."}
          </p>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <h2 className="section-title">Order Details</h2>
          <div className="subcard">
            <div className="stack-tight">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary">Order ID</span>
                <span className="text-sm font-medium text-foreground">{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary">Total</span>
                <span className="text-sm font-medium text-foreground">
                  {formatPrice(order.priceCents + order.platformFeeCents)}
                </span>
              </div>
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

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Order Coverage</p>
        <h1 className="text-4xl text-foreground">{service.title}</h1>
        {service.description ? <p className="max-w-3xl text-foreground-secondary">{service.description}</p> : null}
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
              <span className="text-sm text-foreground-secondary">Service price</span>
              <span className="text-sm font-medium text-foreground">{formatPrice(service.priceCents)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-sm text-foreground-secondary italic">Final amount confirmed on order placement</span>
            </div>
          </div>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Order Form</h2>
        <form className="stack" onSubmit={handlePlaceOrder}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Script ID</span>
            <input
              className="input"
              type="text"
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              placeholder="script_abc123"
            />
            <span className="text-xs text-muted">
              The ID of the script you want coverage for (optional)
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Project ID</span>
            <input
              className="input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="proj_abc123"
            />
            <span className="text-xs text-muted">
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
