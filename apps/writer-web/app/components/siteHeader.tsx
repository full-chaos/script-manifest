"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@script-manifest/contracts";
import { SESSION_CHANGED_EVENT, readStoredSession } from "../lib/authSession";

type NavLink = {
  href: Route;
  label: string;
  signedInOnly?: boolean;
  adminOnly?: boolean;
};

const navLinks: NavLink[] = [
  { href: "/" as Route, label: "Home" },
  { href: "/leaderboard" as Route, label: "Leaderboard" },
  { href: "/competitions" as Route, label: "Competitions" },
  { href: "/profile" as Route, label: "Profile", signedInOnly: true },
  { href: "/projects" as Route, label: "Projects", signedInOnly: true },
  { href: "/submissions" as Route, label: "Submissions", signedInOnly: true },
  { href: "/admin/competitions" as Route, label: "Admin", signedInOnly: true, adminOnly: true }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const syncSession = () => {
      setUser(readStoredSession()?.user ?? null);
    };

    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener(SESSION_CHANGED_EVENT, syncSession);

    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visibleLinks = useMemo(
    () =>
      navLinks.filter((link) => {
        if (link.signedInOnly && !user) {
          return false;
        }
        if (!link.adminOnly) {
          return true;
        }
        return user?.role === "admin";
      }),
    [user]
  );

  return (
    <header className="panel sticky top-3 z-40 border-ink-500/15 bg-white/90">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Link href="/" className="font-display text-3xl font-semibold text-ink-900 no-underline">
            Script Manifest
          </Link>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-500">Writer Hub</p>
        </div>

        <button
          type="button"
          className="btn btn-secondary md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-primary-nav"
          onClick={() => setMobileOpen((current) => !current)}
        >
          Menu
        </button>

        <div className="hidden items-center gap-4 md:flex">
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
                          ? "rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-sm font-semibold text-ember-700 no-underline"
                          : "rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-ink-700 no-underline hover:border-ink-500/20 hover:bg-cream-100"
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2 border-l border-ink-500/15 pl-4">
            {user ? (
              <span className="rounded-full border border-ink-500/20 bg-cream-100 px-3 py-1 text-xs text-ink-700">
                Signed in: {user.displayName}
              </span>
            ) : (
              <span className="rounded-full border border-ink-500/20 bg-cream-100 px-3 py-1 text-xs text-ink-500">
                Public mode
              </span>
            )}
            <Link href="/signin" className="btn btn-primary no-underline">
              {user ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div id="mobile-primary-nav" className="mt-4 space-y-3 border-t border-ink-500/15 pt-4 md:hidden">
          <nav aria-label="Primary Mobile">
            <ul className="space-y-2">
              {visibleLinks.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <li key={`${link.href}-mobile`}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "block rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-sm font-semibold text-ember-700 no-underline"
                          : "block rounded-md border border-ink-500/10 bg-white px-3 py-2 text-sm font-medium text-ink-700 no-underline"
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
            <Link href="/signin" className="btn btn-primary no-underline">
              {user ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
