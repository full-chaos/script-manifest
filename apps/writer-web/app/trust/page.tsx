import type { Metadata } from "next";
import type { TrustProofMetricsPublicResponse } from "@script-manifest/contracts";
import { serverFetch } from "../lib/serverFetch";

const metricsPath = "/api/v1/trust-proof-metrics";

const metricCopy = [
  {
    key: "scriptsHostedTotal",
    label: "Hosted public scripts",
    description: "Only scripts intentionally visible to the marketplace are counted. Private and approved-only scripts stay out of public proof."
  },
  {
    key: "placementsRecordedTotal",
    label: "Recorded placements",
    description: "All placement records are counted so the marketplace shows full historical momentum without filtering for outcome quality."
  },
  {
    key: "placementsVerifiedTotal",
    label: "Verified placements",
    description: "Only placements marked verified by the review workflow are counted here, keeping the proof layer anti-inflation by design."
  },
  {
    key: "competitionsTrackedTotal",
    label: "Tracked competitions",
    description: "Saved competition rows show active writer planning behavior across the marketplace."
  },
  {
    key: "exportsGeneratedTotal",
    label: "Generated exports",
    description: "Successful CSV and ZIP export events are counted after generation, never from button impressions."
  },
  {
    key: "verifiedIndustryDownloadsTotal",
    label: "Verified industry downloads",
    description: "Downloads count only after joining to verified industry accounts, with no public exposure of buyer, writer, or script identity."
  },
  {
    key: "writersExportablePct",
    label: "Writer exportable coverage",
    description: "Route-level CSV and ZIP export coverage across writer accounts; shown as an aggregate percentage only."
  }
] as const;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Trust proof metrics | Script Manifest",
    description: "Public aggregate trust metrics for hosted scripts, verified placements, tracked competitions, writer exports, and verified industry downloads.",
    openGraph: {
      title: "Trust proof metrics | Script Manifest",
      description: "Aggregate trust metrics for the Script Manifest marketplace.",
      type: "website"
    }
  };
}

export default async function TrustPage() {
  const { metrics } = await serverFetch<TrustProofMetricsPublicResponse>(metricsPath, {
    next: { revalidate: 300 }
  });
  const snapshotDate = new Date(metrics.snapshotAt);

  return (
    <section className="space-y-5">
      <article className="hero-card hero-card--violet animate-in overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-tide-500 via-violet-500 to-amber-400" aria-hidden="true" />
        <p className="eyebrow eyebrow--violet">Public proof</p>
        <h1 className="max-w-4xl text-4xl text-foreground md:text-5xl">Proof the marketplace is earning trust</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Script Manifest publishes aggregate-only trust metrics so writers and industry partners can understand marketplace momentum without exposing private identities.
        </p>
        <p className="text-sm text-muted">
          Last refreshed <time dateTime={metrics.snapshotAt}>{snapshotDate.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
        </p>
      </article>

      <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 animate-stagger">
        {metricCopy.map((item) => {
          const raw = metrics[item.key];
          const value = item.key === "writersExportablePct" ? `${raw}%` : Number(raw).toLocaleString();
          const descriptionId = `trust-${item.key}-description`;
          return (
            <div key={item.key} className="subcard stack-tight border-t-4 border-t-primary/50">
              <dt className="text-sm font-semibold text-foreground" aria-describedby={descriptionId}>{item.label}</dt>
              <dd className="text-4xl font-bold tabular-nums text-foreground">{value}</dd>
              <p id={descriptionId} className="text-sm text-foreground-secondary">{item.description}</p>
            </div>
          );
        })}
      </dl>

      <article className="panel stack animate-in animate-in-delay-2">
        <p className="eyebrow">Anti-inflation rules</p>
        <h2 className="section-title">Aggregate-only, source-backed counters</h2>
        <p className="text-foreground-secondary">
          Public numbers are raw aggregate totals refreshed on a scheduled cadence. They never expose industry-user identity, writer identity, script IDs, or requester details.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="subcard"><strong>Public scripts only</strong><p className="text-sm text-foreground-secondary">Private and approved-only records are excluded.</p></div>
          <div className="subcard"><strong>Verified industry only</strong><p className="text-sm text-foreground-secondary">Download proof joins to verified industry accounts.</p></div>
          <div className="subcard"><strong>Generated exports only</strong><p className="text-sm text-foreground-secondary">Export totals use completed CSV/ZIP generation events.</p></div>
        </div>
      </article>
    </section>
  );
}
