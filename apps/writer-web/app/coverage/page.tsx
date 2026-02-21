"use client";

import { useCallback, useEffect, useState } from "react";
import type { CoverageService, CoverageProvider, CoverageTier } from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";

export default function CoverageMarketplacePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<CoverageService[]>([]);
  const [providers, setProviders] = useState<CoverageProvider[]>([]);
  const [tierFilter, setTierFilter] = useState<CoverageTier | "">("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tierFilter) params.set("tier", tierFilter);
      if (minPrice) params.set("minPrice", String(Number(minPrice) * 100));
      if (maxPrice) params.set("maxPrice", String(Number(maxPrice) * 100));

      const [servicesRes, providersRes] = await Promise.all([
        fetch(`/api/v1/coverage/services?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/v1/coverage/providers", { cache: "no-store" })
      ]);

      if (servicesRes.ok) {
        const servicesBody = (await servicesRes.json()) as { services?: CoverageService[] };
        setServices(servicesBody.services ?? []);
      }

      if (providersRes.ok) {
        const providersBody = (await providersRes.json()) as { providers?: CoverageProvider[] };
        setProviders(providersBody.providers ?? []);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load marketplace data.");
    } finally {
      setLoading(false);
    }
  }, [maxPrice, minPrice, tierFilter, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function getProviderName(providerId: string): string {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.displayName ?? "Unknown Provider";
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatTier(tier: CoverageTier): string {
    return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Coverage Marketplace</p>
        <h1 className="text-4xl text-ink-900">Professional script coverage</h1>
        <p className="max-w-3xl text-ink-700">
          Get detailed feedback from experienced coverage providers. Browse services by tier,
          price, and turnaround time to find the perfect fit for your script.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Filter Services</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Tier</span>
            <select
              className="input"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as CoverageTier | "")}
            >
              <option value="">All tiers</option>
              <option value="concept_notes">Concept Notes</option>
              <option value="early_draft">Early Draft</option>
              <option value="polish_proofread">Polish Proofread</option>
              <option value="competition_ready">Competition Ready</option>
            </select>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Min Price ($)</span>
            <input
              type="number"
              className="input"
              placeholder="0"
              min={0}
              step={1}
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Max Price ($)</span>
            <input
              type="number"
              className="input"
              placeholder="500"
              min={0}
              step={1}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </label>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Available Services</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : services.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-ink-900" />}
            title="No services found"
            description="Try adjusting your filters or check back later."
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
                  <div className="mt-2 pt-2 border-t border-ink-500/10">
                    <a
                      href={`/coverage/providers/${encodeURIComponent(service.providerId)}`}
                      className="text-sm text-tide-700 hover:underline"
                    >
                      {getProviderName(service.providerId)}
                    </a>
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
