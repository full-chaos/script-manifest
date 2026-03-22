"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { CoverageOrder, CoverageDelivery, CoverageOrderStatus, CoverageProvider } from "@script-manifest/contracts";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { SkeletonCard } from "../../../components/skeleton";
import { useToast } from "../../../components/toast";
import { useAuth } from "../../../lib/AuthProvider";
import { Modal } from "../../../components/modal";

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  const toast = useToast();
  const { user } = useAuth();
  const [signedInUserId, setSignedInUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<CoverageOrder | null>(null);
  const [delivery, setDelivery] = useState<CoverageDelivery | null>(null);
  const [provider, setProvider] = useState<CoverageProvider | null>(null);

  // Review form
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Provider actions
  const [claiming, setClaiming] = useState(false);
  const [delivering, setDelivering] = useState(false);

  useEffect(() => {
    setSignedInUserId(user?.id ?? "");
  }, [user]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orderResponse = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}`, {
        headers: {},
        cache: "no-store"
      });

      if (!orderResponse.ok) {
        setOrder(null);
        setProvider(null);
        setDelivery(null);
        return;
      }

      const orderBody = (await orderResponse.json()) as { order?: CoverageOrder };
      const nextOrder = orderBody.order ?? null;
      setOrder(nextOrder);

      if (!nextOrder) {
        setProvider(null);
        setDelivery(null);
        return;
      }

      const [providerResponse, deliveryResponse] = await Promise.all([
        fetch(`/api/v1/coverage/providers/${encodeURIComponent(nextOrder.providerId)}`, {
          headers: {},
          cache: "no-store"
        }),
        fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/delivery`, {
          headers: {},
          cache: "no-store"
        })
      ]);

      if (providerResponse.ok) {
        const providerBody = (await providerResponse.json()) as { provider?: CoverageProvider };
        setProvider(providerBody.provider ?? null);
      } else {
        setProvider(null);
      }

      if (deliveryResponse.ok) {
        const deliveryBody = (await deliveryResponse.json()) as { delivery?: CoverageDelivery };
        setDelivery(deliveryBody.delivery ?? null);
      } else if (deliveryResponse.status === 404) {
        setDelivery(null);
      } else {
        setDelivery(null);
        toast.error("Failed to load coverage delivery.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load order details.");
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const [retrying, setRetrying] = useState(false);

  function getDeclineMessage(reason?: string): string {
    if (!reason) return "Your payment was declined. Please try a different card.";
    if (reason.toLowerCase().includes("insufficient")) return "Your card was declined due to insufficient funds.";
    if (reason.toLowerCase().includes("expired")) return "Your card has expired. Please use a different card.";
    return `Your payment was declined: ${reason}. Please try a different card.`;
  }

  async function handleRetryPayment() {
    setRetrying(true);
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/retry-payment`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} }
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to retry payment.");
        return;
      }
      toast.success("Payment retry initiated. Please check your email for confirmation.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry payment.");
    } finally {
      setRetrying(false);
    }
  }
  async function handleClaim() {
    setClaiming(true);
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/claim`, {
        method: "POST",
        headers: {}
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to claim order.");
        return;
      }

      toast.success("Order claimed successfully!");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to claim order.");
    } finally {
      setClaiming(false);
    }
  }

  async function handleDeliver() {
    setDelivering(true);
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/deliver`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify({
          summary: "Sample coverage summary",
          strengths: "Strong character development",
          weaknesses: "Pacing could be improved",
          recommendations: "Tighten act 2",
          score: 75
        })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to deliver order.");
        return;
      }

      toast.success("Order delivered successfully!");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deliver order.");
    } finally {
      setDelivering(false);
    }
  }

  async function handleComplete() {
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/complete`, {
        method: "POST",
        headers: {}
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to complete order.");
        return;
      }

      toast.success("Order completed!");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete order.");
    }
  }

  async function handleDispute() {
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify({
          reason: "quality",
          description: "The coverage did not meet expectations"
        })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to open dispute.");
        return;
      }

      toast.success("Dispute opened.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open dispute.");
    }
  }

  async function handleCancel() {
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: {}
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to cancel order.");
        return;
      }

      toast.success("Order cancelled.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel order.");
    }
  }

  async function handleSubmitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingReview(true);
    try {
      const response = await fetch(`/api/v1/coverage/orders/${encodeURIComponent(orderId)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", ...{} },
        body: JSON.stringify({ rating: Number(rating), comment })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to submit review.");
        return;
      }

      toast.success("Review submitted!");
      setReviewModalOpen(false);
      setRating("");
      setComment("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function getStatusColor(status: CoverageOrderStatus): string {
    const colors: Record<CoverageOrderStatus, string> = {
      placed: "border-border/65 bg-ink-500/10 text-foreground-secondary",
      payment_held: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
      claimed: "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500",
      in_progress: "border-blue-300 bg-blue-50 text-blue-700",
  delivered: "border-violet-400/60 dark:border-violet-300/45 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
      completed: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
      disputed: "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300",
      cancelled: "border-border/65 bg-ink-500/10 text-muted",
      payment_failed: "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300",
      refunded: "border-border/65 bg-ink-500/10 text-muted",
      abandoned: "border-border/65 bg-ink-500/10 text-muted"
    };
    return colors[status] ?? colors.placed;
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
      </section>
    );
  }

  if (!order) {
    return (
      <section className="space-y-4">
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
          title="Order not found"
          description="The order you're looking for doesn't exist or you don't have permission to view it."
        />
      </section>
    );
  }

  const isWriter = order.writerUserId === signedInUserId;
  const isProvider = provider?.userId === signedInUserId;

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Coverage Order</p>
        <h1 className="text-4xl text-foreground">Order {order.id}</h1>
        <div className="mt-4">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(order.status)}`}>
            {order.status.replace(/_/g, " ")}
          </span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Order Details</h2>
        <div className="subcard">
          <div className="stack-tight">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Service price</span>
              <span className="text-sm font-medium text-foreground">{formatPrice(order.priceCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Platform fee</span>
              <span className="text-sm font-medium text-foreground">{formatPrice(order.platformFeeCents)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-base font-semibold text-foreground">
                {formatPrice(order.priceCents + order.platformFeeCents)}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-border/40">
              <p className="text-xs text-muted">Created: {new Date(order.createdAt).toLocaleString()}</p>
              {order.deliveredAt ? (
                <p className="text-xs text-muted">Delivered: {new Date(order.deliveredAt).toLocaleString()}</p>
              ) : null}
              {order.slaDeadline ? (
                <p className="text-xs text-muted">SLA Deadline: {new Date(order.slaDeadline).toLocaleString()}</p>
              ) : null}
            </div>
          </div>
        </div>
      </article>

      {order.status === "payment_failed" ? (
        <article className="panel stack animate-in animate-in-delay-2">
          <h2 className="section-title">Payment Failed</h2>
          <div className="subcard stack-tight">
            <p className="text-sm text-foreground-secondary">
              {getDeclineMessage((order as { paymentFailureReason?: string }).paymentFailureReason)}
            </p>
            {isWriter ? (
              <div className="inline-form pt-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleRetryPayment()}
                  disabled={retrying}
                >
                  {retrying ? "Processing..." : "Retry Payment"}
                </button>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      {delivery ? (
        <article className="panel stack animate-in animate-in-delay-2">
          <h2 className="section-title">Coverage Delivery</h2>
          <div className="subcard stack-tight">
            {delivery.score !== null ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Score</span>
                <span className="inline-flex items-center rounded-full border border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 px-2.5 py-0.5 text-xs font-semibold text-tide-700 dark:text-tide-500">
                  {delivery.score}/100
                </span>
              </div>
            ) : null}
            {delivery.summary ? (
              <div>
                <strong className="text-sm text-foreground">Summary</strong>
                <p className="mt-1 text-sm text-foreground-secondary">{delivery.summary}</p>
              </div>
            ) : null}
            {delivery.strengths ? (
              <div>
                <strong className="text-sm text-foreground">Strengths</strong>
                <p className="mt-1 text-sm text-foreground-secondary">{delivery.strengths}</p>
              </div>
            ) : null}
            {delivery.weaknesses ? (
              <div>
                <strong className="text-sm text-foreground">Weaknesses</strong>
                <p className="mt-1 text-sm text-foreground-secondary">{delivery.weaknesses}</p>
              </div>
            ) : null}
            {delivery.recommendations ? (
              <div>
                <strong className="text-sm text-foreground">Recommendations</strong>
                <p className="mt-1 text-sm text-foreground-secondary">{delivery.recommendations}</p>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      <article className="panel stack animate-in animate-in-delay-3">
        <h2 className="section-title">Actions</h2>
        <div className="inline-form">
          {isWriter && (order.status === "placed" || order.status === "payment_held") ? (
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Cancel Order
            </button>
          ) : null}
          {isWriter && order.status === "delivered" ? (
            <>
              <button type="button" className="btn btn-primary" onClick={handleComplete}>
                Complete Order
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDispute}>
                Open Dispute
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setReviewModalOpen(true)}>
                Leave Review
              </button>
            </>
          ) : null}
          {isProvider && order.status === "payment_held" ? (
            <button type="button" className="btn btn-primary" onClick={handleClaim} disabled={claiming}>
              {claiming ? "Claiming..." : "Claim Order"}
            </button>
          ) : null}
          {isProvider && (order.status === "claimed" || order.status === "in_progress") ? (
            <button type="button" className="btn btn-primary" onClick={handleDeliver} disabled={delivering}>
              {delivering ? "Delivering..." : "Deliver Order"}
            </button>
          ) : null}
        </div>
      </article>

      <Modal open={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title="Leave a Review">
        <form className="stack" onSubmit={handleSubmitReview}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Rating (1-5)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              required
            />
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Comment</span>
            <textarea
              className="input min-h-20"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={5000}
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submittingReview}>
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
