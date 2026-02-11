type SkeletonProps = {
  className?: string;
};

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl border border-ink-500/15 bg-cream-100 p-4 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="h-5 w-2/5 rounded bg-cream-200" />
        <div className="h-5 w-16 rounded-full bg-cream-200" />
      </div>
      <div className="mb-2 h-4 w-4/5 rounded bg-cream-200" />
      <div className="h-4 w-3/5 rounded bg-cream-200" />
    </div>
  );
}

export function SkeletonRow({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl border border-ink-500/15 bg-cream-100 p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-1/3 rounded bg-cream-200" />
        <div className="h-4 w-20 rounded-full bg-cream-200" />
      </div>
    </div>
  );
}

export function SkeletonText({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse space-y-2 ${className}`}
    >
      <div className="h-4 w-full rounded bg-cream-200" />
      <div className="h-4 w-5/6 rounded bg-cream-200" />
      <div className="h-4 w-3/4 rounded bg-cream-200" />
    </div>
  );
}
