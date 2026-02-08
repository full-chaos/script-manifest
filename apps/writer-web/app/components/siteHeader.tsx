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
    <header className="rounded-2xl border border-zinc-300/60 bg-white/80 p-4 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <Link href="/" className="font-display text-3xl font-semibold text-ink-900">
            Script Manifest
          </Link>
          <p className="text-sm text-ink-500">Writers first. Ownership always.</p>
        </div>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                isActive(pathname, link.href)
                  ? "rounded-full border border-ember-500/35 bg-ember-500/10 px-3 py-1.5 text-sm font-semibold text-ember-700"
                  : "rounded-full border border-transparent bg-white/70 px-3 py-1.5 text-sm font-medium text-ink-700 hover:border-zinc-300"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <span className="hidden rounded-full border border-zinc-300/70 bg-white/70 px-3 py-1 text-xs text-ink-700 md:inline-flex">
              Signed in: {user.displayName}
            </span>
          ) : null}
          <Link href="/signin" className="btn btn-primary">
            {user ? "Account" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
