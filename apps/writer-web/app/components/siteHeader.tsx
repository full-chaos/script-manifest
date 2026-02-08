"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@script-manifest/contracts";
import {
  SESSION_CHANGED_EVENT,
  readStoredSession
} from "../lib/authSession";

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
    <header className="site-header">
      <div className="site-brand">
        <Link className="brand-wordmark" href="/">
          Script Manifest
        </Link>
        <p className="brand-subtitle">Writers first. Ownership always.</p>
      </div>

      <nav className="site-nav" aria-label="Primary">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(pathname, link.href) ? "nav-link nav-link-active" : "nav-link"}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="site-actions">
        {user ? <p className="session-pill">Signed in: {user.displayName}</p> : null}
        <Link className="btn btn-active" href="/signin">
          {user ? "Account" : "Sign in"}
        </Link>
      </div>
    </header>
  );
}
