"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Users, Shield, Trophy } from "lucide-react";
import { SkeletonCard } from "../components/skeleton";
import { useToast } from "../components/toast";

type PlatformMetrics = {
  totalUsers: number;
  activeUsers30d: number;
  totalProjects: number;
  openDisputes: number;
  pendingAppeals: number;
  pendingFlags: number;
  pendingReports: number;
};

type StatCard = {
  label: string;
  value: number;
  accent: "default" | "green" | "red";
};

function formatStatCards(metrics: PlatformMetrics): StatCard[] {
  return [
    { label: "Total Users", value: metrics.totalUsers, accent: "default" },
    { label: "Active (30d)", value: metrics.activeUsers30d, accent: "green" },
    { label: "Pending Reports", value: metrics.pendingReports, accent: "red" },
    { label: "Open Appeals", value: metrics.pendingAppeals, accent: "red" },
    { label: "Open Flags", value: metrics.pendingFlags, accent: "red" },
    { label: "Total Projects", value: metrics.totalProjects, accent: "default" }
  ];
}

const accentStyles: Record<StatCard["accent"], string> = {
  default: "text-foreground",
  green: "text-green-700 dark:text-green-400",
  red: "text-red-700 dark:text-red-300"
};

type QuickAction = {
  href: Route;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const quickActions: QuickAction[] = [
  {
    href: "/admin/users" as Route,
    label: "User Management",
    description: "Search, view, and manage user accounts",
    icon: <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
  },
  {
    href: "/admin/moderation" as Route,
    label: "Moderation Queue",
    description: "Review flagged content and pending reports",
    icon: <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
  },
  {
    href: "/admin/rankings" as Route,
    label: "Rankings",
    description: "Monitor leaderboard integrity and scoring",
    icon: <Trophy className="h-5 w-5 text-tide-600 dark:text-tide-400" aria-hidden="true" />
  }
];

export default function AdminDashboardPage() {
  const toast = useToast();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch("/api/v1/admin/metrics", {
          headers: {}
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? "Failed to load admin metrics.");
          return;
        }
        const body = (await response.json()) as { metrics: PlatformMetrics };
        setMetrics(body.metrics);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load admin metrics.");
      } finally {
        setLoading(false);
      }
    }

    void loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statCards = metrics ? formatStatCards(metrics) : [];

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow eyebrow--violet">Admin</p>
        <h1 className="text-4xl text-foreground">Dashboard</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Platform health overview. Monitor user activity, pending moderation items, and key metrics at a glance.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Platform Metrics</h2>
        {loading ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : metrics ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 animate-stagger">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="subcard flex flex-col items-center gap-1 py-5 text-center"
              >
                <span className={`text-3xl font-bold tabular-nums ${accentStyles[card.accent]}`}>
                  {(card.value ?? 0).toLocaleString()}
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                  {card.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Unable to load metrics. Check your connection and permissions.</p>
        )}
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">Quick Actions</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="subcard flex items-start gap-3 no-underline group"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background-secondary group-hover:bg-primary/10 transition-colors">
                {action.icon}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary-dark dark:group-hover:text-primary transition-colors">
                  {action.label}
                </p>
                <p className="mt-0.5 text-sm text-foreground-secondary">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </article>
    </section>
  );
}
