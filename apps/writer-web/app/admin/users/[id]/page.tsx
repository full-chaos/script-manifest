"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { SkeletonCard } from "../../../components/skeleton";
import { EmptyState } from "../../../components/emptyState";
import { EmptyIllustration } from "../../../components/illustrations";
import { useToast } from "../../../components/toast";
import { getAuthHeaders } from "../../../lib/authSession";
import { Modal } from "../../../components/modal";

type AdminUserDetail = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  createdAt: string;
  sessionCount: number;
  reportCount: number;
};

const statusColors: Record<string, string> = {
  active:
    "border-green-300 dark:border-green-400/45 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400",
  suspended:
    "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500",
  banned:
    "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  deleted:
    "border-border/65 bg-ink-500/10 text-muted"
};

const roleColors: Record<string, string> = {
  writer:
    "border-tide-500/30 dark:border-tide-500/40 bg-tide-500/10 dark:bg-tide-500/20 text-tide-700 dark:text-tide-500",
  admin:
    "border-violet-400/60 dark:border-violet-300/45 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400"
};

function getStatusColor(status: string): string {
  return statusColors[status] ?? statusColors.active!;
}

function getRoleColor(role: string): string {
  return roleColors[role] ?? roleColors.writer!;
}

function formatRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Suspend modal
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("30");

  // Ban modal
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState("");

  // Role change
  const [roleSelectValue, setRoleSelectValue] = useState("");

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        headers: getAuthHeaders(),
        cache: "no-store"
      });

      const body = (await response.json()) as { error?: string; user?: AdminUserDetail };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to load user.");
        setUser(null);
        return;
      }

      const nextUser = body.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        setRoleSelectValue(nextUser.role);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load user.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function handleSuspend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!suspendReason.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          action: "suspend",
          reason: suspendReason.trim(),
          durationDays: Number(suspendDuration)
        })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to suspend user.");
        return;
      }

      toast.success("User suspended.");
      setSuspendModalOpen(false);
      setSuspendReason("");
      setSuspendDuration("30");
      await loadUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to suspend user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!banReason.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          action: "ban",
          reason: banReason.trim()
        })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to ban user.");
        return;
      }

      toast.success("User banned.");
      setBanModalOpen(false);
      setBanReason("");
      await loadUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ban user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReactivate() {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: "reactivate" })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to reactivate user.");
        return;
      }

      toast.success("User reactivated.");
      await loadUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate user.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(newRole: string) {
    if (!user || newRole === user.role) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: "changeRole", role: newRole })
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to change role.");
        setRoleSelectValue(user.role);
        return;
      }

      toast.success(`Role changed to ${formatRole(newRole)}.`);
      await loadUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change role.");
      if (user) setRoleSelectValue(user.role);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="space-y-4">
        <div className="mb-4">
          <Link href={"/admin/users" as Route} className="text-sm text-foreground-secondary hover:text-foreground">
            &larr; Back to users
          </Link>
        </div>
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
          title="User not found"
          description="The user you are looking for does not exist or could not be loaded."
        />
      </section>
    );
  }

  const isSuspendedOrBanned = user.accountStatus === "suspended" || user.accountStatus === "banned";

  return (
    <section className="space-y-4">
      <div className="mb-2">
        <Link href={"/admin/users" as Route} className="text-sm text-foreground-secondary hover:text-foreground">
          &larr; Back to users
        </Link>
      </div>

      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin &middot; User Detail</p>
        <h1 className="text-4xl text-foreground">{user.displayName}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getRoleColor(user.role)}`}
          >
            {formatRole(user.role)}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(user.accountStatus)}`}
          >
            {user.accountStatus}
          </span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Account Information</h2>
        <div className="subcard">
          <div className="stack-tight">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Email</span>
              <span className="text-sm font-medium text-foreground">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Email verified</span>
              <span className="text-sm font-medium text-foreground">{user.emailVerified ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Role</span>
              <span className="text-sm font-medium text-foreground">{formatRole(user.role)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Status</span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${getStatusColor(user.accountStatus)}`}
              >
                {user.accountStatus}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <span className="text-sm text-foreground-secondary">Joined</span>
              <span className="text-sm font-medium text-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Sessions</span>
              <span className="text-sm font-medium text-foreground">{user.sessionCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Reports</span>
              <span className={`text-sm font-medium ${user.reportCount > 0 ? "text-red-700 dark:text-red-300" : "text-foreground"}`}>
                {user.reportCount}
              </span>
            </div>
          </div>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Actions</h2>

        <div className="subcard">
          <div className="stack-tight">
            <label className="stack-tight">
              <span className="text-sm font-medium text-foreground">Change Role</span>
              <div className="flex items-center gap-3">
                <select
                  className="input flex-1"
                  value={roleSelectValue}
                  onChange={(e) => setRoleSelectValue(e.target.value)}
                  disabled={submitting}
                >
                  <option value="writer">Writer</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleRoleChange(roleSelectValue)}
                  disabled={submitting || roleSelectValue === user.role}
                >
                  {submitting ? "Saving..." : "Update Role"}
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="inline-form">
          {user.accountStatus === "active" ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSuspendModalOpen(true)}
                disabled={submitting}
              >
                Suspend
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBanModalOpen(true)}
                disabled={submitting}
              >
                Ban
              </button>
            </>
          ) : null}
          {isSuspendedOrBanned ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleReactivate()}
              disabled={submitting}
            >
              {submitting ? "Reactivating..." : "Reactivate"}
            </button>
          ) : null}
        </div>
      </article>

      <Modal
        open={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title="Suspend User"
        description={`Suspend ${user.displayName} from the platform.`}
      >
        <form className="stack" onSubmit={handleSuspend}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              className="input min-h-24"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Explain the reason for suspension..."
              maxLength={5000}
              required
            />
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Duration</span>
            <select
              className="input"
              value={suspendDuration}
              onChange={(e) => setSuspendDuration(e.target.value)}
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Suspending..." : "Confirm Suspension"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={banModalOpen}
        onClose={() => setBanModalOpen(false)}
        title="Ban User"
        description={`Permanently ban ${user.displayName} from the platform. This action can be reversed by reactivating the account.`}
      >
        <form className="stack" onSubmit={handleBan}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Reason</span>
            <textarea
              className="input min-h-24"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Explain the reason for banning this user..."
              maxLength={5000}
              required
            />
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Banning..." : "Confirm Ban"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
