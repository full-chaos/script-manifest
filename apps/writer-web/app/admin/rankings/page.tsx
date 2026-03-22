"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../components/modal";
import { SkeletonCard } from "../../components/skeleton";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { useToast } from "../../components/toast";

type Tab = "appeals" | "flags" | "prestige";

type Appeal = {
  id: string;
  writerId: string;
  reason: string;
  status: "open" | "under_review" | "upheld" | "rejected";
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AntiGamingFlag = {
  id: string;
  writerId: string;
  reason: string;
  details: string;
  status: "open" | "dismissed" | "confirmed";
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PrestigeEntry = {
  competitionId: string;
  tier: "standard" | "notable" | "elite" | "premier";
  multiplier: number;
  updatedAt: string;
};

type AppealFilter = Appeal["status"] | "all";
type FlagFilter = AntiGamingFlag["status"] | "all";

const appealStatusColors: Record<Appeal["status"], string> = {
  open: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  under_review: "border-blue-400/60 dark:border-blue-300/45 bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400",
  upheld: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  rejected: "border-border/65 bg-ink-500/10 text-muted"
};

const flagStatusColors: Record<AntiGamingFlag["status"], string> = {
  open: "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  dismissed: "border-border/65 bg-ink-500/10 text-muted",
  confirmed: "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400"
};

const flagReasonLabels: Record<string, string> = {
  duplicate_submission: "Duplicate Submission",
  suspicious_pattern: "Suspicious Pattern",
  manual_admin: "Manual Admin"
};

const tierLabels: Record<PrestigeEntry["tier"], string> = {
  standard: "Standard",
  notable: "Notable",
  elite: "Elite",
  premier: "Premier"
};

export default function AdminRankingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("appeals");

  // Appeals state
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(false);
  const [appealFilter, setAppealFilter] = useState<AppealFilter>("all");
  const [resolveAppealOpen, setResolveAppealOpen] = useState(false);
  const [resolveAppealTarget, setResolveAppealTarget] = useState<Appeal | null>(null);
  const [appealDecision, setAppealDecision] = useState<"upheld" | "rejected">("upheld");
  const [appealResolutionNote, setAppealResolutionNote] = useState("");
  const [resolvingAppeal, setResolvingAppeal] = useState(false);

  // Flags state
  const [flags, setFlags] = useState<AntiGamingFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [resolveFlagOpen, setResolveFlagOpen] = useState(false);
  const [resolveFlagTarget, setResolveFlagTarget] = useState<AntiGamingFlag | null>(null);
  const [flagDecision, setFlagDecision] = useState<"dismissed" | "confirmed">("dismissed");
  const [resolvingFlag, setResolvingFlag] = useState(false);

  // Prestige state
  const [prestigeEntries, setPrestigeEntries] = useState<PrestigeEntry[]>([]);
  const [prestigeLoading, setPrestigeLoading] = useState(false);
  const [editPrestigeOpen, setEditPrestigeOpen] = useState(false);
  const [editPrestigeTarget, setEditPrestigeTarget] = useState<PrestigeEntry | null>(null);
  const [editTier, setEditTier] = useState<PrestigeEntry["tier"]>("standard");
  const [editMultiplier, setEditMultiplier] = useState("");
  const [savingPrestige, setSavingPrestige] = useState(false);
  const [recomputeOpen, setRecomputeOpen] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  // --- Data fetching ---

  const loadAppeals = useCallback(async () => {
    setAppealsLoading(true);
    try {
      const params = appealFilter !== "all" ? `?status=${appealFilter}` : "";
      const response = await fetch(`/api/v1/admin/rankings/appeals${params}`, {
        headers: {},
        cache: "no-store"
      });
      const body = (await response.json()) as { appeals?: Appeal[]; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to load appeals.");
        return;
      }
      setAppeals(body.appeals ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load appeals.");
    } finally {
      setAppealsLoading(false);
    }
  }, [appealFilter, toast]);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const params = flagFilter !== "all" ? `?status=${flagFilter}` : "";
      const response = await fetch(`/api/v1/admin/rankings/flags${params}`, {
        headers: {},
        cache: "no-store"
      });
      const body = (await response.json()) as { flags?: AntiGamingFlag[]; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to load flags.");
        return;
      }
      setFlags(body.flags ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load flags.");
    } finally {
      setFlagsLoading(false);
    }
  }, [flagFilter, toast]);

  const loadPrestige = useCallback(async () => {
    setPrestigeLoading(true);
    try {
      const response = await fetch("/api/v1/admin/rankings/prestige", {
        headers: {},
        cache: "no-store"
      });
      const body = (await response.json()) as { entries?: PrestigeEntry[]; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to load prestige data.");
        return;
      }
      setPrestigeEntries(body.entries ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load prestige data.");
    } finally {
      setPrestigeLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === "appeals") {
      void loadAppeals();
    } else if (activeTab === "flags") {
      void loadFlags();
    } else {
      void loadPrestige();
    }
  }, [activeTab, loadAppeals, loadFlags, loadPrestige]);

  // --- Appeal actions ---

  function openResolveAppeal(appeal: Appeal) {
    setResolveAppealTarget(appeal);
    setAppealDecision("upheld");
    setAppealResolutionNote("");
    setResolveAppealOpen(true);
  }

  async function handleResolveAppeal() {
    if (!resolveAppealTarget) return;
    setResolvingAppeal(true);
    try {
      const response = await fetch(
        `/api/v1/admin/rankings/appeals/${encodeURIComponent(resolveAppealTarget.id)}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} },
          body: JSON.stringify({
            status: appealDecision,
            resolutionNote: appealResolutionNote
          })
        }
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to resolve appeal.");
        return;
      }
      toast.success(`Appeal ${appealDecision}.`);
      setResolveAppealOpen(false);
      setResolveAppealTarget(null);
      await loadAppeals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve appeal.");
    } finally {
      setResolvingAppeal(false);
    }
  }

  // --- Flag actions ---

  function openResolveFlag(flag: AntiGamingFlag) {
    setResolveFlagTarget(flag);
    setFlagDecision("dismissed");
    setResolveFlagOpen(true);
  }

  async function handleResolveFlag() {
    if (!resolveFlagTarget) return;
    setResolvingFlag(true);
    try {
      const response = await fetch(
        `/api/v1/admin/rankings/flags/${encodeURIComponent(resolveFlagTarget.id)}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...{} },
          body: JSON.stringify({ status: flagDecision })
        }
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to resolve flag.");
        return;
      }
      toast.success(`Flag ${flagDecision}.`);
      setResolveFlagOpen(false);
      setResolveFlagTarget(null);
      await loadFlags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve flag.");
    } finally {
      setResolvingFlag(false);
    }
  }

  // --- Prestige actions ---

  function openEditPrestige(entry: PrestigeEntry) {
    setEditPrestigeTarget(entry);
    setEditTier(entry.tier);
    setEditMultiplier(String(entry.multiplier));
    setEditPrestigeOpen(true);
  }

  async function handleSavePrestige() {
    if (!editPrestigeTarget) return;
    setSavingPrestige(true);
    try {
      const response = await fetch(
        `/api/v1/admin/rankings/prestige/${encodeURIComponent(editPrestigeTarget.competitionId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", ...{} },
          body: JSON.stringify({
            tier: editTier,
            multiplier: Number(editMultiplier)
          })
        }
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to update prestige.");
        return;
      }
      toast.success("Prestige updated.");
      setEditPrestigeOpen(false);
      setEditPrestigeTarget(null);
      await loadPrestige();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update prestige.");
    } finally {
      setSavingPrestige(false);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const response = await fetch("/api/v1/admin/rankings/recompute", {
        method: "POST",
        headers: {}
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to recompute rankings.");
        return;
      }
      toast.success("Rankings recomputed successfully.");
      setRecomputeOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to recompute rankings.");
    } finally {
      setRecomputing(false);
    }
  }

  // --- Tab config ---

  const tabs: { key: Tab; label: string }[] = [
    { key: "appeals", label: "Appeals" },
    { key: "flags", label: "Anti-Gaming Flags" },
    { key: "prestige", label: "Prestige" }
  ];

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin Rankings</p>
        <h1 className="text-4xl text-foreground">Rankings administration</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Review ranking appeals, investigate anti-gaming flags, and manage competition prestige tiers from one console.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <nav className="flex gap-2 border-b border-border/55 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                activeTab === tab.key
                  ? "rounded-md border border-primary/45 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary-dark dark:text-primary"
                  : "rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-foreground-secondary hover:border-border/65 hover:bg-background-secondary"
              }
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ---- Appeals Tab ---- */}
        {activeTab === "appeals" ? (
          <div className="stack">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Appeals</h2>
              <div className="flex gap-2">
                {(["all", "open", "under_review", "upheld", "rejected"] as AppealFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={
                      appealFilter === filter
                        ? "rounded-md border border-primary/45 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-dark dark:text-primary"
                        : "rounded-md border border-transparent px-2.5 py-1 text-[11px] font-medium text-foreground-secondary hover:border-border/65 hover:bg-background-secondary"
                    }
                    onClick={() => setAppealFilter(filter)}
                  >
                    {filter === "all" ? "All" : filter === "under_review" ? "Under Review" : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {appealsLoading ? (
              <div className="stack">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : appeals.length === 0 ? (
              <EmptyState
                illustration={<EmptyIllustration variant="inbox" className="h-14 w-14 text-foreground" />}
                title="No appeals found"
                description="Appeals matching the current filter will appear here."
              />
            ) : (
              <div className="stack">
                {appeals.map((appeal) => (
                  <article key={appeal.id} className="subcard">
                    <div className="subcard-header">
                      <div className="min-w-0">
                        <strong className="text-foreground">Writer {appeal.writerId}</strong>
                        <p className="mt-1 text-sm text-foreground-secondary">{appeal.reason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${appealStatusColors[appeal.status]}`}>
                          {appeal.status === "under_review" ? "Under Review" : appeal.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Created {new Date(appeal.createdAt).toLocaleDateString()}
                    </p>
                    {appeal.resolutionNote ? (
                      <p className="mt-2 text-sm text-foreground-secondary">
                        <span className="font-medium">Resolution:</span> {appeal.resolutionNote}
                      </p>
                    ) : null}
                    {appeal.status === "open" || appeal.status === "under_review" ? (
                      <div className="mt-3 inline-form">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => openResolveAppeal(appeal)}
                        >
                          Resolve
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* ---- Flags Tab ---- */}
        {activeTab === "flags" ? (
          <div className="stack">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Anti-Gaming Flags</h2>
              <div className="flex gap-2">
                {(["all", "open", "dismissed", "confirmed"] as FlagFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={
                      flagFilter === filter
                        ? "rounded-md border border-primary/45 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-dark dark:text-primary"
                        : "rounded-md border border-transparent px-2.5 py-1 text-[11px] font-medium text-foreground-secondary hover:border-border/65 hover:bg-background-secondary"
                    }
                    onClick={() => setFlagFilter(filter)}
                  >
                    {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {flagsLoading ? (
              <div className="stack">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : flags.length === 0 ? (
              <EmptyState
                illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
                title="No flags found"
                description="Anti-gaming flags matching the current filter will appear here."
              />
            ) : (
              <div className="stack">
                {flags.map((flag) => (
                  <article key={flag.id} className="subcard">
                    <div className="subcard-header">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-foreground">Writer {flag.writerId}</strong>
                          <span className="badge">{flagReasonLabels[flag.reason] ?? flag.reason}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground-secondary">{flag.details}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${flagStatusColors[flag.status]}`}>
                          {flag.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Created {new Date(flag.createdAt).toLocaleDateString()}
                    </p>
                    {flag.status === "open" ? (
                      <div className="mt-3 inline-form">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => openResolveFlag(flag)}
                        >
                          Resolve
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* ---- Prestige Tab ---- */}
        {activeTab === "prestige" ? (
          <div className="stack">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Competition Prestige</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setRecomputeOpen(true)}
              >
                Recompute Rankings
              </button>
            </div>

            {prestigeLoading ? (
              <div className="stack">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : prestigeEntries.length === 0 ? (
              <EmptyState
                illustration={<EmptyIllustration variant="chart" className="h-14 w-14 text-foreground" />}
                title="No prestige entries"
                description="Competition prestige tiers will appear here once configured."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/55 text-left text-xs font-medium text-muted">
                      <th className="pb-2 pr-4">Competition</th>
                      <th className="pb-2 pr-4">Tier</th>
                      <th className="pb-2 pr-4">Multiplier</th>
                      <th className="pb-2 pr-4">Updated</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {prestigeEntries.map((entry) => (
                      <tr key={entry.competitionId} className="border-b border-border/30">
                        <td className="py-3 pr-4 font-medium text-foreground">{entry.competitionId}</td>
                        <td className="py-3 pr-4">
                          <span className="badge">{tierLabels[entry.tier]}</span>
                        </td>
                        <td className="py-3 pr-4 text-foreground-secondary">{entry.multiplier}x</td>
                        <td className="py-3 pr-4 text-xs text-muted">
                          {new Date(entry.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openEditPrestige(entry)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </article>

      {/* ---- Resolve Appeal Modal ---- */}
      <Modal
        open={resolveAppealOpen}
        onClose={() => setResolveAppealOpen(false)}
        title="Resolve Appeal"
        description={resolveAppealTarget ? `Appeal from writer ${resolveAppealTarget.writerId}` : undefined}
      >
        <div className="stack">
          <label className="stack-tight">
            <span>Decision</span>
            <select
              className="input"
              value={appealDecision}
              onChange={(e) => setAppealDecision(e.target.value as "upheld" | "rejected")}
            >
              <option value="upheld">Upheld</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="stack-tight">
            <span>Resolution note</span>
            <textarea
              className="input min-h-20"
              value={appealResolutionNote}
              onChange={(e) => setAppealResolutionNote(e.target.value)}
              placeholder="Explain the reasoning behind this decision..."
              maxLength={2000}
            />
          </label>
          <div className="inline-form">
            <button
              type="button"
              className="btn btn-primary"
              disabled={resolvingAppeal}
              onClick={() => void handleResolveAppeal()}
            >
              {resolvingAppeal ? "Resolving..." : "Submit Decision"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setResolveAppealOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Resolve Flag Modal ---- */}
      <Modal
        open={resolveFlagOpen}
        onClose={() => setResolveFlagOpen(false)}
        title="Resolve Flag"
        description={resolveFlagTarget ? `Flag for writer ${resolveFlagTarget.writerId} — ${flagReasonLabels[resolveFlagTarget.reason] ?? resolveFlagTarget.reason}` : undefined}
      >
        <div className="stack">
          <label className="stack-tight">
            <span>Decision</span>
            <select
              className="input"
              value={flagDecision}
              onChange={(e) => setFlagDecision(e.target.value as "dismissed" | "confirmed")}
            >
              <option value="dismissed">Dismissed</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
          <div className="inline-form">
            <button
              type="button"
              className="btn btn-primary"
              disabled={resolvingFlag}
              onClick={() => void handleResolveFlag()}
            >
              {resolvingFlag ? "Resolving..." : "Submit Decision"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setResolveFlagOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Edit Prestige Modal ---- */}
      <Modal
        open={editPrestigeOpen}
        onClose={() => setEditPrestigeOpen(false)}
        title="Edit Prestige"
        description={editPrestigeTarget ? `Competition ${editPrestigeTarget.competitionId}` : undefined}
      >
        <div className="stack">
          <label className="stack-tight">
            <span>Tier</span>
            <select
              className="input"
              value={editTier}
              onChange={(e) => setEditTier(e.target.value as PrestigeEntry["tier"])}
            >
              <option value="standard">Standard</option>
              <option value="notable">Notable</option>
              <option value="elite">Elite</option>
              <option value="premier">Premier</option>
            </select>
          </label>
          <label className="stack-tight">
            <span>Multiplier</span>
            <input
              className="input"
              type="number"
              min={0}
              step={0.1}
              value={editMultiplier}
              onChange={(e) => setEditMultiplier(e.target.value)}
            />
          </label>
          <div className="inline-form">
            <button
              type="button"
              className="btn btn-primary"
              disabled={savingPrestige}
              onClick={() => void handleSavePrestige()}
            >
              {savingPrestige ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditPrestigeOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Recompute Confirmation Modal ---- */}
      <Modal
        open={recomputeOpen}
        onClose={() => setRecomputeOpen(false)}
        title="Recompute Rankings"
        description="This will recalculate all writer rankings based on current data. This operation may take a moment."
      >
        <div className="stack">
          <p className="text-sm text-foreground-secondary">
            Are you sure you want to recompute all rankings? This will update every writer&rsquo;s ranking score and position.
          </p>
          <div className="inline-form">
            <button
              type="button"
              className="btn btn-primary"
              disabled={recomputing}
              onClick={() => void handleRecompute()}
            >
              {recomputing ? "Recomputing..." : "Confirm Recompute"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRecomputeOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
