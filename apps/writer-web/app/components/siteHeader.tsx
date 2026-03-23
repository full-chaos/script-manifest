"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "../lib/AuthProvider";
import { Menu, X } from "lucide-react";
import { NotificationBell } from "./notificationBell";
import { ThemeToggle } from "./themeToggle";
import { UserMenu } from "./userMenu";

type NavLink = {
  href: Route;
  label: string;
  signedInOnly?: boolean;
};

const navLinks: NavLink[] = [
  { href: "/" as Route, label: "Home" },
  { href: "/leaderboard" as Route, label: "Leaderboard" },
  { href: "/competitions" as Route, label: "Competitions" },
  { href: "/projects" as Route, label: "Projects", signedInOnly: true },
  { href: "/submissions" as Route, label: "Submissions", signedInOnly: true },
  { href: "/feedback" as Route, label: "Feedback", signedInOnly: true },
  { href: "/coverage" as Route, label: "Coverage", signedInOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  const visibleLinks = useMemo(
    () =>
      navLinks.filter((link) => !link.signedInOnly || user),
    [user]
  );

  const currentLabel = useMemo(() => {
    const match = visibleLinks.find((link) => isActive(pathname, link.href));
    return match?.label ?? null;
  }, [pathname, visibleLinks]);

  return (
    <header className="panel sticky top-3 z-40">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <Image
            src="/script-manifest.png"
            alt="Script Manifest"
            width={40}
            height={40}
            priority
          />
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground-secondary">Writer Hub</span>
        </Link>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          {!mobileOpen && currentLabel ? (
            <span className="text-xs font-medium text-foreground-secondary">{currentLabel}</span>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary p-2!"
            aria-expanded={mobileOpen}
            aria-controls="mobile-primary-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <nav aria-label="Primary">
            <ul className="flex items-center gap-2">
              {visibleLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "rounded-md border border-primary/45 bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary-dark no-underline dark:text-primary"
                          : "rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-foreground-secondary no-underline hover:border-border/60 hover:bg-background-secondary"
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2 border-l border-border/60 pl-4">
            <ThemeToggle />
            {user ? <NotificationBell /> : null}
            <UserMenu />
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div id="mobile-primary-nav" className="mt-4 space-y-3 border-t border-border/60 pt-4 lg:hidden">
          <nav aria-label="Primary Mobile">
            <ul className="space-y-2">
              {visibleLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={`${link.href}-mobile`}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={
                        active
                          ? "block rounded-md border border-primary/45 bg-primary/15 px-3 py-2 text-sm font-semibold text-primary-dark no-underline dark:text-primary"
                          : "block rounded-md border border-border/55 bg-surface px-3 py-2 text-sm font-medium text-foreground-secondary no-underline"
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="inline-form">
            <ThemeToggle />
            {user ? <NotificationBell /> : null}
            <UserMenu />
          </div>
        </div>
      ) : null}
    </header>
  );
}
