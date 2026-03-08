"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldBan, Ban, Clock } from "lucide-react";
import { SkeletonCard } from "../../components/skeleton";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";

// ── Types ────────────────────────────────────────────────────────

type IpBlockEntry = {
  id: string;
  ipAddress: string;
  reason: string;
  blockedBy: string;
  autoBlocked: boolean;
  expiresAt: string | null;
  createdAt: string;
};

type UserSuspension = {
  id: string;
  userId: string;
  reason: string;
  suspendedBy: string;
  durationDays: number | null;
  startedAt: string;
  expiresAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  createdAt: string;
};

// ── Component ────────────────────────────────────────────────────

export default function AdminSecurityPage() {
  const toast = useToast();

  // IP Blocklist state
  const [blocks, setBlocks] = useState<IpBlockEntry[]>([]);
  const [blocksTotal, setBlocksTotal] = useState(0);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocksPage, setBlocksPage] = useState(1);
  const blocksLimit = 20;

  // IP Block form state
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExpiresHours, setNewExpiresHours] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  // Suspension search state
  const [suspensionUserId, setSuspensionUserId] = useState("");
  const [suspensions, setSuspensions] = useState<UserSuspension[]>([]);
  const [suspensionsLoading, setSuspensionsLoading] = useState(false);

  // ── IP Blocklist ────────────────────────────────────────────────

  const loadBlocks = useCallback(
    async (currentPage: number) => {
      setBlocksLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("limit", String(blocksLimit));

        const response = await fetch(`/api/v1/admin/ip-blocks?${params.toString()}`, {
          headers: getAuthHeaders(),
          cache: "no-store"
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? "Failed to load IP blocks.");
          return;
        }

        const body = (await response.json()) as { blocks: IpBlockEntry[]; total: number };
        setBlocks(body.blocks ?? []);
        setBlocksTotal(body.total ?? 0);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load IP blocks.");
      } finally {
        setBlocksLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadBlocks(1);
  }, [loadBlocks]);

  async function handleAddBlock() {
    if (!newIp.trim() || !newReason.trim()) {
      toast.error("IP address and reason are required.");
      return;
    }

    setAddingBlock(true);
    try {
      const body: Record<string, unknown> = {
        ipAddress: newIp.trim(),
        reason: newReason.trim()
      };
      if (newExpiresHours.trim()) {
        const hours = Number(newExpiresHours.trim());
        if (hours > 0) {
          body.expiresInHours = hours;
        }
      }

      const response = await fetch("/api/v1/admin/ip-blocks", {
        method: "POST",
        headers: { ...getAuthHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const resBody = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(resBody.error ?? "Failed to add IP block.");
        return;
      }

      toast.success("IP address blocked successfully.");
      setNewIp("");
      setNewReason("");
      setNewExpiresHours("");
      void loadBlocks(blocksPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add IP block.");
    } finally {
      setAddingBlock(false);
    }
  }

  async function handleRemoveBlock(id: string) {
    try {
      const response = await fetch(`/api/v1/admin/ip-blocks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to remove IP block.");
        return;
      }

      toast.success("IP block removed.");
      void loadBlocks(blocksPage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove IP block.");
    }
  }

  // ── Suspension Overview ─────────────────────────────────────────

  async function handleSearchSuspensions() {
    if (!suspensionUserId.trim()) {
      toast.error("Enter a user ID to search suspensions.");
      return;
    }

    setSuspensionsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/users/${encodeURIComponent(suspensionUserId.trim())}/suspensions`,
        { headers: getAuthHeaders(), cache: "no-store" }
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to load suspension history.");
        return;
      }

      const body = (await response.json()) as { suspensions: UserSuspension[] };
      setSuspensions(body.suspensions ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load suspensions.");
    } finally {
      setSuspensionsLoading(false);
    }
  }

  // ── Pagination ──────────────────────────────────────────────────

  const blocksTotalPages = Math.max(1, Math.ceil(blocksTotal / blocksLimit));

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Security</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Manage IP blocklist and review user suspensions. Block abusive IPs and monitor enforcement actions.
        </p>
      </article>

      {/* ── IP Blocklist ──────────────────────────────────────────── */}

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title flex items-center gap-2">
          <ShieldBan className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
          IP Blocklist
        </h2>

        {/* Add block form */}
        <div className="subcard">
          <p className="text-sm font-medium text-foreground mb-3">Block an IP Address</p>
          <div className="grid-two">
            <label className="stack-tight">
              <span className="text-sm text-foreground-secondary">IP Address</span>
              <input
                className="input"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="192.168.1.1 or 2001:db8::1"
              />
            </label>
            <label className="stack-tight">
              <span className="text-sm text-foreground-secondary">Expires in (hours, optional)</span>
              <input
                className="input"
                type="number"
                min="1"
                max="8760"
                value={newExpiresHours}
                onChange={(e) => setNewExpiresHours(e.target.value)}
                placeholder="Leave empty for permanent"
              />
            </label>
          </div>
          <label className="stack-tight mt-3">
            <span className="text-sm text-foreground-secondary">Reason</span>
            <input
              className="input"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Brute force attack, spam, etc."
            />
          </label>
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleAddBlock()}
              disabled={addingBlock}
            >
              {addingBlock ? "Blocking..." : "Block IP"}
            </button>
          </div>
        </div>

        {/* Blocks table */}
        {blocksLoading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : blocks.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="No blocked IPs"
            description="No IP addresses are currently blocked."
          />
        ) : (
          <div className="stack">
            {blocks.map((block) => (
              <div key={block.id} className="subcard flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="font-mono text-foreground">{block.ipAddress}</strong>
                    {block.autoBlocked ? (
                      <span className="badge text-amber-700 dark:text-amber-400">Auto</span>
                    ) : null}
                    {block.expiresAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Expires {new Date(block.expiresAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="badge text-red-700 dark:text-red-400">Permanent</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground-secondary">{block.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    Blocked {new Date(block.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => void handleRemoveBlock(block.id)}
                >
                  Remove
                </button>
              </div>
            ))}

            {/* Pagination */}
            {blocks.length > 0 ? (
              <div className="flex items-center justify-between border-t border-border/40 pt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const prev = Math.max(1, blocksPage - 1);
                    setBlocksPage(prev);
                    void loadBlocks(prev);
                  }}
                  disabled={blocksPage <= 1}
                >
                  Previous
                </button>
                <span className="text-sm text-foreground-secondary">
                  Page {blocksPage} of {blocksTotalPages} ({blocksTotal} total)
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const next = Math.min(blocksTotalPages, blocksPage + 1);
                    setBlocksPage(next);
                    void loadBlocks(next);
                  }}
                  disabled={blocksPage >= blocksTotalPages}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        )}
      </article>

      {/* ── Suspension Overview ───────────────────────────────────── */}

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title flex items-center gap-2">
          <Ban className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          Suspension History
        </h2>

        <div className="subcard">
          <p className="text-sm font-medium text-foreground mb-3">Look up user suspension history</p>
          <div className="flex gap-3 items-end">
            <label className="stack-tight flex-1">
              <span className="text-sm text-foreground-secondary">User ID</span>
              <input
                className="input"
                value={suspensionUserId}
                onChange={(e) => setSuspensionUserId(e.target.value)}
                placeholder="user_abc123..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSearchSuspensions();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSearchSuspensions()}
              disabled={suspensionsLoading}
            >
              {suspensionsLoading ? "Loading..." : "Search"}
            </button>
          </div>
        </div>

        {suspensionsLoading ? (
          <div className="stack">
            <SkeletonCard />
          </div>
        ) : suspensions.length === 0 ? (
          suspensionUserId.trim() ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
              title="No suspensions found"
              description="This user has no suspension records."
            />
          ) : null
        ) : (
          <div className="stack">
            {suspensions.map((suspension) => (
              <div key={suspension.id} className="subcard">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-foreground">{suspension.reason}</strong>
                      {suspension.liftedAt ? (
                        <span className="badge text-green-700 dark:text-green-400">Lifted</span>
                      ) : suspension.expiresAt ? (
                        <span className="badge text-amber-700 dark:text-amber-400">Active (Temporary)</span>
                      ) : (
                        <span className="badge text-red-700 dark:text-red-400">Active (Permanent)</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground-secondary">
                      Duration: {suspension.durationDays ? `${suspension.durationDays} days` : "Permanent"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Started {new Date(suspension.startedAt).toLocaleString()}
                      {suspension.expiresAt
                        ? ` | Expires ${new Date(suspension.expiresAt).toLocaleString()}`
                        : ""}
                      {suspension.liftedAt
                        ? ` | Lifted ${new Date(suspension.liftedAt).toLocaleString()} by ${suspension.liftedBy ?? "system"}`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
