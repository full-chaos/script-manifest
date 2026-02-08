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
};

const navLinks: NavLink[] = [
  { href: "/" as Route, label: "Home" },
  { href: "/competitions" as Route, label: "Competitions" },
  { href: "/profile" as Route, label: "Profile", signedInOnly: true },
  { href: "/projects" as Route, label: "Projects", signedInOnly: true },
  { href: "/submissions" as Route, label: "Submissions", signedInOnly: true }
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

  const visibleLinks = useMemo(
    () => navLinks.filter((link) => !link.signedInOnly || user),
    [user]
  );

  return (
    <header className="panel sticky top-3 z-40 border-zinc-200/80 bg-white/90">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <Link href="/" className="font-display text-3xl font-semibold text-ink-900 no-underline">
            Script Manifest
          </Link>
          <p className="text-sm text-ink-500">Portfolio durability for screenwriters.</p>
        </div>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {visibleLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "rounded-full border border-ember-500/40 bg-ember-500/10 px-3 py-1.5 text-sm font-semibold text-ember-700 no-underline"
                    : "rounded-full border border-zinc-200/80 bg-white/75 px-3 py-1.5 text-sm font-medium text-ink-700 no-underline hover:border-zinc-300"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <span className="hidden rounded-full border border-zinc-300/80 bg-white px-3 py-1 text-xs text-ink-700 lg:inline-flex">
              Signed in: {user.displayName}
            </span>
          ) : (
            <span className="hidden rounded-full border border-zinc-300/80 bg-white px-3 py-1 text-xs text-ink-500 lg:inline-flex">
              Writer hub beta
            </span>
          )}
          <Link href="/signin" className="btn btn-primary no-underline">
            {user ? "Account" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
