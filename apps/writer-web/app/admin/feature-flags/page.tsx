"use client";

import { useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { fetcher, ApiError } from "../../lib/fetcher";
import { useToast } from "../../components/toast";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";

type FeatureFlag = {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPct: number;
  userAllowlist: string[];
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const LIST_KEY = "/api/v1/admin/feature-flags";

type CreateArg = { key: string; description: string };
type UpdateArg = { key: string; description?: string; rolloutPct?: number; userAllowlist?: string[]; enabled?: boolean };
type DeleteArg = { key: string };

async function createFetcher(
  _key: string,
  { arg }: { arg: CreateArg }
): Promise<{ flag: FeatureFlag }> {
  return fetcher<{ flag: FeatureFlag }>(LIST_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: arg.key, description: arg.description })
  });
}

async function updateFetcher(
  _key: string,
  { arg }: { arg: UpdateArg }
): Promise<{ flag: FeatureFlag }> {
  return fetcher<{ flag: FeatureFlag }>(
    `/api/v1/admin/feature-flags/${encodeURIComponent(arg.key)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(arg.description !== undefined ? { description: arg.description } : {}),
        ...(arg.rolloutPct !== undefined ? { rolloutPct: arg.rolloutPct } : {}),
        ...(arg.userAllowlist !== undefined ? { userAllowlist: arg.userAllowlist } : {}),
        ...(arg.enabled !== undefined ? { enabled: arg.enabled } : {})
      })
    }
  );
}

async function deleteFetcher(
  _key: string,
  { arg }: { arg: DeleteArg }
): Promise<void> {
  return fetcher<void>(
    `/api/v1/admin/feature-flags/${encodeURIComponent(arg.key)}`,
    { method: "DELETE" }
  );
}

export default function FeatureFlagsPage() {
  const toast = useToast();

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editRollout, setEditRollout] = useState(0);
  const [editAllowlist, setEditAllowlist] = useState("");

  // Delete confirmation
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ flags: FeatureFlag[] }>(LIST_KEY);
  const flags = data?.flags ?? [];

  const { trigger: triggerCreate, isMutating: creating } = useSWRMutation(LIST_KEY, createFetcher);
  const { trigger: triggerUpdate, isMutating: saving } = useSWRMutation(LIST_KEY, updateFetcher);
  const { trigger: triggerDelete } = useSWRMutation(LIST_KEY, deleteFetcher);

  async function handleCreate() {
    if (!newKey.trim()) return;
    try {
      await triggerCreate({ key: newKey.trim(), description: newDescription.trim() });
      toast.success(`Flag "${newKey}" created.`);
      setNewKey("");
      setNewDescription("");
      setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create flag.");
    }
  }

  async function handleToggle(key: string, currentEnabled: boolean) {
    const optimisticFlags = (data?.flags ?? []).map((f) =>
      f.key === key ? { ...f, enabled: !currentEnabled } : f
    );
    try {
      await mutate(
        triggerUpdate({ key, enabled: !currentEnabled }).then(() => ({ flags: optimisticFlags })),
        { optimisticData: { flags: optimisticFlags }, rollbackOnError: true, revalidate: true }
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to toggle flag.");
    }
  }

  function startEdit(flag: FeatureFlag) {
    setEditingKey(flag.key);
    setEditDescription(flag.description);
    setEditRollout(flag.rolloutPct);
    setEditAllowlist(flag.userAllowlist.join("\n"));
  }

  async function handleSaveEdit() {
    if (!editingKey) return;
    const allowlist = editAllowlist
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    try {
      await triggerUpdate({
        key: editingKey,
        description: editDescription,
        rolloutPct: editRollout,
        userAllowlist: allowlist
      });
      toast.success(`Flag "${editingKey}" updated.`);
      setEditingKey(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update flag.");
    }
  }

  async function handleDelete(key: string) {
    try {
      await triggerDelete({ key });
      toast.success(`Flag "${key}" deleted.`);
      setDeletingKey(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete flag.");
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Feature Flags</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Control feature rollout with flags. Toggle features on or off, set rollout percentages, and manage user allowlists.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Flags</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "Cancel" : "Create Flag"}
          </button>
        </div>

        {showCreate && (
          <div className="subcard space-y-3 animate-in">
            <div>
              <label htmlFor="flag-key" className="block text-sm font-medium text-foreground-secondary mb-1">
                Key
              </label>
              <input
                id="flag-key"
                type="text"
                className="input w-full"
                placeholder="my_feature_flag"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">
                Lowercase letters, numbers, and underscores. Must start with a letter.
              </p>
            </div>
            <div>
              <label htmlFor="flag-description" className="block text-sm font-medium text-foreground-secondary mb-1">
                Description
              </label>
              <input
                id="flag-description"
                type="text"
                className="input w-full"
                placeholder="Brief description of this feature flag"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating || !newKey.trim()}
              onClick={() => { void handleCreate(); }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        )}

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {error instanceof ApiError ? error.message : "Failed to load feature flags."}
          </p>
        ) : isLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : flags.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration className="h-24 w-24 text-foreground-secondary/50" />}
            title="No feature flags"
            description="Create your first feature flag to control feature rollout."
          />
        ) : (
          <div className="space-y-3 animate-stagger">
            {flags.map((flag) => (
              <div key={flag.key} className="subcard space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {flag.key}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        flag.enabled
                          ? "border-green-300 dark:border-green-400/45 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400"
                          : "border-border/65 bg-ink-500/10 text-muted"
                      }`}>
                        {flag.enabled ? "Enabled" : "Disabled"}
                      </span>
                      {flag.rolloutPct > 0 && flag.rolloutPct < 100 && (
                        <span className="inline-flex items-center rounded-full border border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-500">
                          {flag.rolloutPct}% rollout
                        </span>
                      )}
                    </div>
                    {flag.description && (
                      <p className="text-sm text-foreground-secondary mt-0.5">
                        {flag.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={flag.enabled}
                      aria-label={`Toggle ${flag.key}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        flag.enabled ? "bg-green-600 dark:bg-green-500" : "bg-ink-300 dark:bg-ink-600"
                      }`}
                      onClick={() => { void handleToggle(flag.key, flag.enabled); }}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        flag.enabled ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      onClick={() => startEdit(flag)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs text-red-600 dark:text-red-400"
                      onClick={() => setDeletingKey(flag.key)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Edit panel */}
                {editingKey === flag.key && (
                  <div className="border-t border-border/40 pt-3 space-y-3 animate-in">
                    <div>
                      <label htmlFor={`edit-desc-${flag.key}`} className="block text-sm font-medium text-foreground-secondary mb-1">
                        Description
                      </label>
                      <input
                        id={`edit-desc-${flag.key}`}
                        type="text"
                        className="input w-full"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor={`edit-rollout-${flag.key}`} className="block text-sm font-medium text-foreground-secondary mb-1">
                        Rollout Percentage: {editRollout}%
                      </label>
                      <input
                        id={`edit-rollout-${flag.key}`}
                        type="range"
                        min={0}
                        max={100}
                        className="w-full"
                        value={editRollout}
                        onChange={(e) => setEditRollout(Number(e.target.value))}
                      />
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`edit-allowlist-${flag.key}`} className="block text-sm font-medium text-foreground-secondary mb-1">
                        User Allowlist (one user ID per line)
                      </label>
                      <textarea
                        id={`edit-allowlist-${flag.key}`}
                        className="input w-full h-20 font-mono text-xs"
                        placeholder="user_abc123&#10;user_def456"
                        value={editAllowlist}
                        onChange={(e) => setEditAllowlist(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving}
                        onClick={() => { void handleSaveEdit(); }}
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditingKey(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete confirmation */}
                {deletingKey === flag.key && (
                  <div className="border-t border-border/40 pt-3 flex items-center gap-3 animate-in">
                    <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                      Delete this flag permanently?
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary text-xs bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                      onClick={() => { void handleDelete(flag.key); }}
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      onClick={() => setDeletingKey(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="text-xs text-muted">
                  {flag.userAllowlist.length > 0 && (
                    <span className="mr-3">
                      Allowlist: {flag.userAllowlist.length} user{flag.userAllowlist.length === 1 ? "" : "s"}
                    </span>
                  )}
                  <span>Updated {new Date(flag.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
