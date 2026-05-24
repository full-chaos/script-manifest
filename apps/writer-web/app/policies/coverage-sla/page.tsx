import Link from "next/link";

export default function CoverageSlaPolicyPage() {
  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Coverage marketplace</p>
        <h1 className="text-4xl text-foreground">Coverage SLA Policy</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Service-level expectations for marketplace coverage orders, provider response times, and buyer remedies.
        </p>
      </article>

      <article className="panel stack mx-auto max-w-3xl">
        <h2 className="text-xl font-semibold text-foreground">Delivery commitments</h2>
        <p className="text-foreground-secondary">
          Coverage providers must publish turnaround windows before checkout and deliver notes by the committed due date.
          Providers should acknowledge new orders within one business day and notify buyers early if delivery risk appears.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Late delivery handling</h2>
        <p className="text-foreground-secondary">
          If an order misses its committed window without buyer-approved extension, Script Manifest support may escalate the
          order, request a revised delivery plan, or apply the dispute and refund workflow.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Provider accountability</h2>
        <p className="text-foreground-secondary">
          Repeated SLA misses can affect provider verification state, marketplace visibility, and continued eligibility to
          sell coverage services on Script Manifest.
        </p>

        <p className="text-sm text-muted">Last updated: May 2026.</p>

        <Link href="/coverage" className="text-ember-500 hover:underline text-sm">
          &larr; Back to coverage marketplace
        </Link>
      </article>
    </section>
  );
}
