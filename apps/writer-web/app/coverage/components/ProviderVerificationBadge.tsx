import type { ProviderBadge } from "@script-manifest/contracts";

type ProviderVerificationBadgeProps = {
  badge: ProviderBadge | null | undefined;
  variant?: "compact" | "full";
};

const STYLE_BY_KIND: Record<ProviderBadge["kind"], string> = {
  verified_provider: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  unverified_provider: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  verification_rejected: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  provider_suspended: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

export function ProviderVerificationBadge({ badge, variant = "compact" }: ProviderVerificationBadgeProps) {
  if (!badge) return null;

  if (variant === "full") {
    return (
      <div className={`rounded-2xl border px-4 py-3 ${STYLE_BY_KIND[badge.kind]}`} aria-label={`${badge.label}: ${badge.description}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true">{badge.kind === "verified_provider" ? "✓" : "!"}</span>
          <span>{badge.label}</span>
        </div>
        <p className="mt-1 text-sm opacity-90">{badge.description}</p>
        {badge.verifiedAt ? (
          <p className="mt-1 text-xs opacity-75">Verified {new Date(badge.verifiedAt).toLocaleDateString()}</p>
        ) : null}
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STYLE_BY_KIND[badge.kind]}`}
      aria-label={`${badge.label}: ${badge.description}`}
      title={badge.description}
    >
      <span aria-hidden="true">{badge.kind === "verified_provider" ? "✓" : "!"}</span>
      {badge.label}
    </span>
  );
}
