import Link from "next/link";

export default function DisputeRefundPolicyPage() {
  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Coverage marketplace</p>
        <h1 className="text-4xl text-foreground">Dispute &amp; Refund Policy</h1>
        <p className="max-w-3xl text-foreground-secondary">
          How buyers and providers can request review when coverage delivery, quality, or payment expectations are not met.
        </p>
      </article>

      <article className="panel stack mx-auto max-w-3xl">
        <h2 className="text-xl font-semibold text-foreground">Opening a dispute</h2>
        <p className="text-foreground-secondary">
          Buyers should open disputes from the order detail page and include the order issue, requested remedy, and any
          supporting context. Providers receive notice and may respond with delivery evidence or a proposed resolution.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Support review</h2>
        <p className="text-foreground-secondary">
          Disputes are reviewed by Script Manifest support using order metadata, delivery artifacts, messages, and the
          published coverage SLA. Support may request additional information from either party before deciding.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Refund eligibility</h2>
        <p className="text-foreground-secondary">
          Refunds may be approved when coverage is not delivered, materially misses the purchased scope, or violates the
          provider&apos;s published SLA without buyer-approved extension. Partial refunds may apply when some value was delivered.
        </p>

        <h2 className="text-xl font-semibold text-foreground">Provider impact</h2>
        <p className="text-foreground-secondary">
          Confirmed disputes can inform verification reviews, marketplace trust badges, provider suspension decisions, and
          repeat-quality monitoring.
        </p>

        <p className="text-sm text-muted">Last updated: May 2026.</p>

        <Link href="/coverage" className="text-ember-500 hover:underline text-sm">
          &larr; Back to coverage marketplace
        </Link>
      </article>
    </section>
  );
}
