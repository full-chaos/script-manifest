"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import type { CoverageService, CoverageOrder } from "@script-manifest/contracts";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { SkeletonCard } from "../../../components/skeleton";
import { useToast } from "../../../components/toast";
import { useAuth } from "../../../lib/AuthProvider";
import { fetcher, ApiError } from "../../../lib/fetcher";
import { StripeProvider } from "../../components/StripeProvider";
import { PaymentForm } from "../../components/PaymentForm";

export default function OrderFlowPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [scriptId, setScriptId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<CoverageOrder | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Service is public — no auth pause needed
  const serviceKey = serviceId ? `/api/v1/coverage/services/${encodeURIComponent(serviceId)}` : null;

  const { data: serviceData, isLoading } = useSWR<{ service?: CoverageService } | CoverageService>(
    serviceKey,
    fetcher,
    {
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to load service details.");
      },
    }
  );

  const service = serviceData
    ? ("service" in serviceData ? serviceData.service : serviceData) as CoverageService | undefined ?? null
    : null;

  async function handlePlaceOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service) return;

    setPlacing(true);
    try {
      const body = await fetcher<{ order?: CoverageOrder; clientSecret?: string }>(
        "/api/v1/coverage/orders",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ serviceId, scriptId, projectId }),
        }
      );
      setOrder(body.order ?? null);
      if (body.clientSecret) {
        setClientSecret(body.clientSecret);
      }
      toast.success("Order placed! Please complete payment below.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to place order.");
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

  if (isLoading) {
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
        <form className="stack" onSubmit={(e) => void handlePlaceOrder(e)}>
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
              The ID of the script you want coverage for
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Project ID</span>
            <input
              className="input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="project_abc123"
            />
            <span className="text-xs text-muted">
              Optional: associate this order with a project
            </span>
          </label>
          <div className="inline-form">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={placing || !userId}
            >
              {placing ? "Placing Order..." : "Place Order"}
            </button>
            {!userId ? (
              <p className="text-sm text-foreground-secondary">Sign in to place an order.</p>
            ) : null}
          </div>
        </form>
      </article>
    </section>
  );
}
