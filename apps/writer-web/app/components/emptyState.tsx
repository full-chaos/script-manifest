import Link from "next/link";
import type { Route } from "next";

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: Route;
  onAction?: () => void;
};

export function EmptyState({ icon, title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink-500/20 bg-white/60 px-6 py-10 text-center">
      {icon ? <span className="text-4xl" role="img" aria-hidden="true">{icon}</span> : null}
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-500">{description}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn btn-primary mt-1 no-underline">
          {actionLabel}
        </Link>
      ) : actionLabel && onAction ? (
        <button type="button" className="btn btn-primary mt-1" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
