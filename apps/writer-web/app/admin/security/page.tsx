"use client";

import { useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { ShieldBan, Ban, Clock } from "lucide-react";
import { fetcher, ApiError } from "../../lib/fetcher";
import { SkeletonCard } from "../../components/skeleton";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { useToast } from "../../components/toast";

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

// ── Cache key builders ────────────────────────────────────────────

const blocksLimit = 20;

function buildBlocksKey(page: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(blocksLimit));
  return `/api/v1/admin/ip-blocks?${params.toString()}`;
}

function buildSuspensionsKey(userId: string): string {
  return `/api/v1/admin/users/${encodeURIComponent(userId)}/suspensions`;
}

// ── Mutation fetchers ─────────────────────────────────────────────

type AddBlockArg = {
  ipAddress: string;
  reason: string;
  expiresInHours?: number;
};

async function addBlockFetcher(
  _key: string,
  { arg }: { arg: AddBlockArg }
): Promise<{ block: IpBlockEntry }> {
  const body: Record<string, unknown> = {
    ipAddress: arg.ipAddress,
    reason: arg.reason
  };
  if (arg.expiresInHours !== undefined) {
    body.expiresInHours = arg.expiresInHours;
  }
  return fetcher<{ block: IpBlockEntry }>("/api/v1/admin/ip-blocks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function removeBlockFetcher(
  _key: string,
  { arg }: { arg: { id: string } }
): Promise<void> {
  return fetcher<void>(`/api/v1/admin/ip-blocks/${encodeURIComponent(arg.id)}`, {
    method: "DELETE"
  });
}

// ── Component ────────────────────────────────────────────────────

export default function AdminSecurityPage() {
  const toast = useToast();

  // IP Blocklist state
  const [blocksPage, setBlocksPage] = useState(1);

  // IP Block form state
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExpiresHours, setNewExpiresHours] = useState("");

  // Suspension search state
  const [suspensionUserId, setSuspensionUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState<string | null>(null);

  // ── SWR reads ────────────────────────────────────────────────

  const blocksKey = buildBlocksKey(blocksPage);
  const { data: blocksData, error: blocksError, isLoading: blocksLoading } =
    useSWR<{ blocks: IpBlockEntry[]; total: number }>(blocksKey);
  const blocks = blocksData?.blocks ?? [];
  const blocksTotal = blocksData?.total ?? 0;

  const suspensionsKey = searchedUserId ? buildSuspensionsKey(searchedUserId) : null;
  const { data: suspensionsData, error: suspensionsError, isLoading: suspensionsLoading } =
    useSWR<{ suspensions: UserSuspension[] }>(suspensionsKey, {
      shouldRetryOnError: false,
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        if (err instanceof ApiError && err.status === 404) return;
        if (retryCount >= 3) return;
        void revalidate({ retryCount });
      }
    });
  const suspensions =
    suspensionsData?.suspensions ??
    (suspensionsError instanceof ApiError && suspensionsError.status === 404 ? [] : null);

  // ── Mutations ─────────────────────────────────────────────────

  const { trigger: triggerAddBlock, isMutating: addingBlock } = useSWRMutation(
    blocksKey,
    addBlockFetcher
  );

  const { trigger: triggerRemoveBlock } = useSWRMutation(blocksKey, removeBlockFetcher);

  // ── Handlers ─────────────────────────────────────────────────

  async function handleAddBlock() {
    if (!newIp.trim() || !newReason.trim()) {
      toast.error("IP address and reason are required.");
      return;
    }

    const arg: AddBlockArg = {
      ipAddress: newIp.trim(),
      reason: newReason.trim()
    };

    const hours = Number(newExpiresHours.trim());
    if (newExpiresHours.trim() && hours > 0) {
      arg.expiresInHours = hours;
    }

    try {
      await triggerAddBlock(arg);
      toast.success("IP address blocked successfully.");
      setNewIp("");
      setNewReason("");
      setNewExpiresHours("");
      setBlocksPage(1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add IP block.");
    }
  }

  async function handleRemoveBlock(id: string) {
    try {
      await triggerRemoveBlock({ id });
      toast.success("IP block removed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove IP block.");
    }
  }

  function handleSearchSuspensions() {
    if (!suspensionUserId.trim()) {
      toast.error("Enter a user ID to search suspensions.");
      return;
    }
    setSearchedUserId(suspensionUserId.trim());
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
        ) : blocksError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {blocksError instanceof ApiError ? blocksError.message : "Failed to load IP blocks."}
          </p>
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
                  onClick={() => setBlocksPage(Math.max(1, blocksPage - 1))}
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
                  onClick={() => setBlocksPage(Math.min(blocksTotalPages, blocksPage + 1))}
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
                    handleSearchSuspensions();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSearchSuspensions()}
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
        ) : suspensionsError && !(suspensionsError instanceof ApiError && suspensionsError.status === 404) ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {suspensionsError instanceof ApiError ? suspensionsError.message : "Failed to load suspensions."}
          </p>
        ) : suspensions !== null && suspensions.length === 0 ? (
          searchedUserId ? (
            <EmptyState
              illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
              title="No suspensions found"
              description="This user has no suspension records."
            />
          ) : null
        ) : suspensions !== null && suspensions.length > 0 ? (
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
        ) : null}
      </article>
    </section>
  );
}
