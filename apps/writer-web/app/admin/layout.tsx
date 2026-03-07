"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Shield,
  Trophy,
  Award,
  AlertTriangle,
  ScrollText
} from "lucide-react";

type NavItem = {
  href: Route;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { href: "/admin" as Route, label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
  { href: "/admin/users" as Route, label: "Users", icon: <Users className="h-4 w-4" aria-hidden="true" /> },
  { href: "/admin/moderation" as Route, label: "Moderation", icon: <Shield className="h-4 w-4" aria-hidden="true" /> },
  { href: "/admin/rankings" as Route, label: "Rankings", icon: <Trophy className="h-4 w-4" aria-hidden="true" /> },
  { href: "/admin/competitions" as Route, label: "Competitions", icon: <Award className="h-4 w-4" aria-hidden="true" /> },
  { href: "/coverage/admin/disputes" as Route, label: "Disputes", icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" /> },
  { href: "/admin/audit-log" as Route, label: "Audit Log", icon: <ScrollText className="h-4 w-4" aria-hidden="true" /> }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Mobile: horizontal tabs */}
      <nav
        aria-label="Admin navigation"
        className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
      >
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/45 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary-dark no-underline dark:text-primary"
                  : "flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-foreground-secondary no-underline hover:border-border/65 hover:bg-background-secondary"
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden lg:block w-[220px] shrink-0">
        <nav aria-label="Admin navigation" className="panel stack sticky top-20">
          <p className="eyebrow">Admin Panel</p>
          <ul className="stack-tight">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex items-center gap-2.5 rounded-lg border border-primary/45 bg-primary/15 px-3 py-2 text-sm font-semibold text-primary-dark no-underline dark:text-primary"
                        : "flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-foreground-secondary no-underline hover:border-border/65 hover:bg-background-secondary"
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
