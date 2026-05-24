import { PendingHistoricalList } from "./PendingHistoricalList";

export default function AdminPlacementsPage() {
  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin Review</p>
        <h1 className="text-4xl text-foreground">Historical placement evidence</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review writer-submitted historical placements and approve or reject the attached evidence.
        </p>
      </article>
      <PendingHistoricalList />
    </section>
  );
}
