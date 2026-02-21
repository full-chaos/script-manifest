"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CoverageProvider, CoverageService, CoverageReview } from "@script-manifest/contracts";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { SkeletonCard } from "../../../components/skeleton";
import { useToast } from "../../../components/toast";

export default function ProviderProfilePage() {
  const params = useParams();
  const providerId = params.id as string;
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<CoverageProvider | null>(null);
  const [services, setServices] = useState<CoverageService[]>([]);
  const [reviews, setReviews] = useState<CoverageReview[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [providerRes, servicesRes, reviewsRes] = await Promise.all([
        fetch(`/api/v1/coverage/providers/${encodeURIComponent(providerId)}`, { cache: "no-store" }),
        fetch(`/api/v1/coverage/services?providerId=${encodeURIComponent(providerId)}`, { cache: "no-store" }),
        fetch(`/api/v1/coverage/providers/${encodeURIComponent(providerId)}/reviews`, { cache: "no-store" })
      ]);

      if (providerRes.ok) {
        const providerBody = (await providerRes.json()) as { provider?: CoverageProvider };
        setProvider(providerBody.provider ?? null);
      }

      if (servicesRes.ok) {
        const servicesBody = (await servicesRes.json()) as { services?: CoverageService[] };
        setServices(servicesBody.services ?? []);
      }

      if (reviewsRes.ok) {
        const reviewsBody = (await reviewsRes.json()) as { reviews?: CoverageReview[] };
        setReviews(reviewsBody.reviews ?? []);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load provider data.");
    } finally {
      setLoading(false);
    }
  }, [providerId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTier(tier: string): string {
    return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderStars(rating: number) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= rating ? "text-amber-500" : "text-ink-500/30"}>
            ★
          </span>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  if (!provider) {
    return (
      <section className="space-y-4">
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
          title="Provider not found"
          description="The provider you're looking for doesn't exist or has been removed."
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Coverage Provider</p>
        <h1 className="text-4xl text-ink-900">{provider.displayName}</h1>
        {provider.bio ? <p className="max-w-3xl text-ink-700">{provider.bio}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {provider.specialties.map((specialty) => (
            <span key={specialty} className="badge">
              {specialty}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          {provider.avgRating !== null ? (
            <div className="flex items-center gap-2">
              {renderStars(Math.round(provider.avgRating))}
              <span className="text-sm text-ink-700">{provider.avgRating.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-sm text-ink-500">No ratings yet</span>
          )}
          <span className="text-sm text-ink-700">
            {provider.totalOrdersCompleted} {provider.totalOrdersCompleted === 1 ? "order" : "orders"} completed
          </span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Services Offered</h2>
        {services.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No services available"
            description="This provider hasn't listed any services yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.id} className="subcard">
                <div className="stack-tight">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-lg text-ink-900">{service.title}</strong>
                    <span className="inline-flex items-center rounded-full border border-tide-500/30 bg-tide-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-tide-700">
                      {formatTier(service.tier)}
                    </span>
                  </div>
                  {service.description ? (
                    <p className="text-sm text-ink-700 line-clamp-2">{service.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{formatPrice(service.priceCents)}</span>
                    <span className="badge">{service.turnaroundDays}d turnaround</span>
                    <span className="badge">Up to {service.maxPages}pp</span>
                  </div>
                  <div className="mt-3">
                    <a
                      href={`/coverage/order/${encodeURIComponent(service.id)}`}
                      className="btn btn-primary no-underline"
                    >
                      Order Coverage
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Reviews</h2>
        {reviews.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No reviews yet"
            description="This provider hasn't received any reviews yet."
          />
        ) : (
          <div className="stack">
            {reviews.map((review) => (
              <article key={review.id} className="subcard">
                <div className="flex items-start justify-between gap-3">
                  <div className="stack-tight flex-1">
                    {renderStars(review.rating)}
                    {review.comment ? (
                      <p className="text-sm text-ink-700">{review.comment}</p>
                    ) : null}
                    <span className="text-xs text-ink-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
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
