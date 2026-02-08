"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import type { AuthUser } from "@script-manifest/contracts";
import { SESSION_CHANGED_EVENT, readStoredSession } from "./lib/authSession";

type Surface = {
  title: string;
  description: string;
  href: Route;
};

const writerSurfaces: Surface[] = [
  {
    title: "Profile",
    description: "Create a public writer profile with your bio, genres, and goals.",
    href: "/profile"
  },
  {
    title: "Projects",
    description: "Manage scripts, co-writers, and draft lifecycle from one workspace.",
    href: "/projects"
  },
  {
    title: "Competitions",
    description: "Search opportunities by format, fee, genre, and deadline proximity.",
    href: "/competitions"
  },
  {
    title: "Submissions",
    description: "Track placements and move submissions across draft-ready projects.",
    href: "/submissions"
  }
];

export default function HomePage() {
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

  if (!user) {
    return (
      <section className="landing stack">
        <article className="hero-panel">
          <p className="eyebrow">Phase 1 Writer Hub</p>
          <h1>Build your screenwriting portfolio without losing your history again.</h1>
          <p className="hero-copy">
            Script Manifest gives writers a durable home for profiles, projects, submissions,
            and discoverability workflows. Your work stays portable and under your control.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-active" href="/signin">
              Create account
            </Link>
            <Link className="btn" href="/competitions">
              Browse competitions
            </Link>
          </div>
        </article>

        <section className="feature-grid" aria-label="Platform capabilities">
          {writerSurfaces.map((surface) => (
            <article key={surface.title} className="feature-card">
              <h2>{surface.title}</h2>
              <p>{surface.description}</p>
              <Link href={surface.href}>Open {surface.title}</Link>
            </article>
          ))}
        </section>
      </section>
    );
  }

  return (
    <section className="stack">
      <article className="card stack">
        <p className="eyebrow">Welcome back</p>
        <h2>{user.displayName}</h2>
        <p className="muted">Jump directly into your active workflow.</p>
      </article>

      <section className="feature-grid" aria-label="Quick actions">
        {writerSurfaces.map((surface) => (
          <article className="feature-card" key={surface.title}>
            <h3>{surface.title}</h3>
            <p>{surface.description}</p>
            <Link className="btn" href={surface.href}>
              Open {surface.title}
            </Link>
          </article>
        ))}
      </section>
    </section>
  );
}
