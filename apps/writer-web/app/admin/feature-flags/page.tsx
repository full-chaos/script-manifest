"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";
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

export default function FeatureFlagsPage() {
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editRollout, setEditRollout] = useState(0);
  const [editAllowlist, setEditAllowlist] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/admin/feature-flags", {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to load feature flags.");
        return;
      }
      const body = (await response.json()) as { flags: FeatureFlag[] };
      setFlags(body.flags);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load feature flags.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const handleCreate = useCallback(async () => {
    if (!newKey.trim()) return;
    setCreating(true);
    try {
      const response = await fetch("/api/v1/admin/feature-flags", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ key: newKey.trim(), description: newDescription.trim() })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to create flag.");
        return;
      }
      toast.success(`Flag "${newKey}" created.`);
      setNewKey("");
      setNewDescription("");
      setShowCreate(false);
      void loadFlags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create flag.");
    } finally {
      setCreating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newKey, newDescription, loadFlags]);

  const handleToggle = useCallback(async (key: string, currentEnabled: boolean) => {
    try {
      const response = await fetch(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to toggle flag.");
        return;
      }
      setFlags(prev => prev.map(f => f.key === key ? { ...f, enabled: !currentEnabled } : f));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle flag.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = useCallback((flag: FeatureFlag) => {
    setEditingKey(flag.key);
    setEditDescription(flag.description);
    setEditRollout(flag.rolloutPct);
    setEditAllowlist(flag.userAllowlist.join("\n"));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      const allowlist = editAllowlist
        .split("\n")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      const response = await fetch(`/api/v1/admin/feature-flags/${encodeURIComponent(editingKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          description: editDescription,
          rolloutPct: editRollout,
          userAllowlist: allowlist
        })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to update flag.");
        return;
      }
      toast.success(`Flag "${editingKey}" updated.`);
      setEditingKey(null);
      void loadFlags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update flag.");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey, editDescription, editRollout, editAllowlist, loadFlags]);

  const handleDelete = useCallback(async (key: string) => {
    try {
      const response = await fetch(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!response.ok && response.status !== 204) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to delete flag.");
        return;
      }
      toast.success(`Flag "${key}" deleted.`);
      setDeletingKey(null);
      void loadFlags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete flag.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFlags]);

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

        {loading ? (
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
