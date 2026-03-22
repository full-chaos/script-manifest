"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { getAuthHeaders } from "../../lib/authSession";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  createdAt: string;
};

type UsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
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
    "border-violet-400/60 dark:border-violet-300/45 bg-violet-500/10 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
  partner:
    "border-sky-400/60 dark:border-sky-300/45 bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  industry_professional:
    "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500"
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

export default function AdminUsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const limit = 20;

  const loadUsers = useCallback(
    async (currentPage: number, currentSearch: string, currentRole: string, currentStatus: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("limit", String(limit));
        if (currentSearch.trim()) {
          params.set("search", currentSearch.trim());
        }
        if (currentRole) {
          params.set("role", currentRole);
        }
        if (currentStatus) {
          params.set("status", currentStatus);
        }

        const response = await fetch(`/api/v1/admin/users?${params.toString()}`, {
          headers: {},
          cache: "no-store"
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          toast.error(body.error ?? "Failed to load users.");
          return;
        }

        const body = (await response.json()) as UsersResponse;
        setUsers(body.users ?? []);
        setTotal(body.total ?? 0);
        setPage(body.page ?? currentPage);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadUsers(1, "", "", "");
  }, [loadUsers]);

  function handleSearch() {
    setPage(1);
    void loadUsers(1, search, roleFilter, statusFilter);
  }

  function handlePrevious() {
    if (page <= 1) return;
    const nextPage = page - 1;
    setPage(nextPage);
    void loadUsers(nextPage, search, roleFilter, statusFilter);
  }

  function handleNext() {
    const maxPage = Math.ceil(total / limit);
    if (page >= maxPage) return;
    const nextPage = page + 1;
    setPage(nextPage);
    void loadUsers(nextPage, search, roleFilter, statusFilter);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Admin</p>
        <h1 className="text-4xl text-foreground">User Management</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Search, filter, and manage user accounts across the platform.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Search &amp; Filter</h2>
        <div className="grid-two">
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Search by name or email</span>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="jane@example.com"
            />
          </label>
          <div className="flex gap-3">
            <label className="stack-tight flex-1">
              <span className="text-sm font-medium text-foreground">Role</span>
              <select
                className="input"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                <option value="writer">Writer</option>
                <option value="admin">Admin</option>
                <option value="partner">Partner</option>
                <option value="industry_professional">Industry Professional</option>
              </select>
            </label>
            <label className="stack-tight flex-1">
              <span className="text-sm font-medium text-foreground">Status</span>
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>
            </label>
          </div>
        </div>
        <div className="inline-form">
          <button type="button" className="btn btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch("");
              setRoleFilter("");
              setStatusFilter("");
              setPage(1);
              void loadUsers(1, "", "", "");
            }}
            disabled={loading}
          >
            Reset
          </button>
          <span className="badge">{total} total</span>
        </div>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Users</h2>
        {loading ? (
          <div className="stack">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
            title="No users found"
            description="Try adjusting your search or filter criteria."
          />
        ) : (
          <div className="stack">
            {users.map((user) => (
              <article
                key={user.id}
                className="subcard cursor-pointer transition-colors hover:bg-background-secondary/50"
                onClick={() => router.push(`/admin/users/${encodeURIComponent(user.id)}` as Route)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/admin/users/${encodeURIComponent(user.id)}` as Route);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="truncate text-foreground">{user.displayName}</strong>
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
                    <p className="mt-1 text-sm text-foreground-secondary">{user.email}</p>
                    <p className="mt-1 text-xs text-muted">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                      {!user.emailVerified ? (
                        <span className="ml-2 text-amber-600 dark:text-amber-400">Email not verified</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-muted">&rsaquo;</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && users.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border/40 pt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrevious}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span className="text-sm text-foreground-secondary">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNext}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
