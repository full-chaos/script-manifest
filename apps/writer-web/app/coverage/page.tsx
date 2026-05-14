import type { CoverageProvider, CoverageService, CoverageTier } from "@script-manifest/contracts";
import { EmptyState } from "../components/emptyState";
import { EmptyIllustration } from "../components/illustrations";
import { ApiError } from "../lib/fetcher";
import { serverFetch } from "../lib/serverFetch";
import { CoverageFilters, OnboardingPing } from "./filters";

type CoverageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type CoverageMarketplacePageProps = {
  searchParams?: CoverageSearchParams;
};

type CoverageFiltersValue = {
  tier: CoverageTier | "";
  minPrice: string;
  maxPrice: string;
};

const SERVICES_PATH = "/api/v1/coverage/services";
const PROVIDERS_PATH = "/api/v1/coverage/providers";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function readFilters(params: Record<string, string | string[] | undefined>): CoverageFiltersValue {
  return {
    tier: firstParam(params.tier) as CoverageTier | "",
    minPrice: firstParam(params.minPrice),
    maxPrice: firstParam(params.maxPrice),
  };
}

function buildServicesSearchParams(filters: CoverageFiltersValue): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tier) params.set("tier", filters.tier);
  if (filters.minPrice) params.set("minPrice", String(Number(filters.minPrice) * 100));
  if (filters.maxPrice) params.set("maxPrice", String(Number(filters.maxPrice) * 100));
  return params;
}

function getProviderName(providers: CoverageProvider[], providerId: string): string {
  const provider = providers.find((p) => p.id === providerId);
  return provider?.displayName ?? "Unknown Provider";
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTier(tier: CoverageTier): string {
  return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  );
}

export default async function CoverageMarketplacePage({
  searchParams,
}: CoverageMarketplacePageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const filters = readFilters(params);
  let services: CoverageService[] = [];
  let providers: CoverageProvider[] = [];
  let errorMessage: string | null = null;

  try {
    const [servicesData, providersData] = await Promise.all([
      serverFetch<{ services: CoverageService[] }>(SERVICES_PATH, {
        searchParams: buildServicesSearchParams(filters),
      }),
      serverFetch<{ providers: CoverageProvider[] }>(PROVIDERS_PATH),
    ]);
    services = servicesData.services;
    providers = providersData.providers;
  } catch (err) {
    errorMessage = err instanceof ApiError ? err.message : "Failed to load marketplace data.";
  }

  return (
    <section className="space-y-4">
      <OnboardingPing />
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Coverage Marketplace</p>
        <h1 className="text-4xl text-foreground">Professional script coverage</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Get detailed feedback from experienced coverage providers. Browse services by tier,
          price, and turnaround time to find the perfect fit for your script.
        </p>
      </article>

      <CoverageFilters tier={filters.tier} minPrice={filters.minPrice} maxPrice={filters.maxPrice} />

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Available Services</h2>
        {errorMessage ? (
          <ErrorState message={errorMessage} />
        ) : services.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="No services found"
            description="Try adjusting your filters or check back later."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article key={service.id} className="subcard">
                <div className="stack-tight">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-lg text-foreground">{service.title}</strong>
                    <span className="inline-flex items-center rounded-full border border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-tide-700 dark:text-tide-500">
                      {formatTier(service.tier)}
                    </span>
                  </div>
                  {service.description ? (
                    <p className="text-sm text-foreground-secondary line-clamp-2">{service.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{formatPrice(service.priceCents)}</span>
                    <span className="badge">{service.turnaroundDays}d turnaround</span>
                    <span className="badge">Up to {service.maxPages}pp</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <a
                      href={`/coverage/providers/${encodeURIComponent(service.providerId)}`}
                      className="text-sm text-tide-700 dark:text-tide-500 hover:underline"
                    >
                      {getProviderName(providers, service.providerId)}
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
