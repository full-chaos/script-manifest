type SkeletonProps = {
  className?: string;
};

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl border border-border/55 bg-background-secondary p-4 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="h-5 w-2/5 rounded bg-background-secondary" />
        <div className="h-5 w-16 rounded-full bg-background-secondary" />
      </div>
      <div className="mb-2 h-4 w-4/5 rounded bg-background-secondary" />
      <div className="h-4 w-3/5 rounded bg-background-secondary" />
    </div>
  );
}

export function SkeletonRow({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl border border-border/55 bg-background-secondary p-4 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-1/3 rounded bg-background-secondary" />
        <div className="h-4 w-20 rounded-full bg-background-secondary" />
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
      <div className="h-4 w-full rounded bg-background-secondary" />
      <div className="h-4 w-5/6 rounded bg-background-secondary" />
      <div className="h-4 w-3/4 rounded bg-background-secondary" />
    </div>
  );
}
