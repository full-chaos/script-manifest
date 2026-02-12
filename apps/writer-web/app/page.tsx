"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import type { AuthUser } from "@script-manifest/contracts";
import { SESSION_CHANGED_EVENT, readStoredSession } from "./lib/authSession";
import { UserPen, FolderOpen, Trophy, TrendingUp, Send, type LucideIcon } from "lucide-react";

type Surface = {
  title: string;
  description: string;
  href: Route;
  icon: LucideIcon;
};

const writerSurfaces: Surface[] = [
  {
    title: "Profile",
    description: "Create a public writer profile with your bio, genres, and representation status.",
    href: "/profile" as Route,
    icon: UserPen
  },
  {
    title: "Projects",
    description: "Manage scripts, co-writers, and your draft lifecycle in one workspace.",
    href: "/projects" as Route,
    icon: FolderOpen
  },
  {
    title: "Competitions",
    description: "Search opportunities by format, fee, genre, and deadline proximity.",
    href: "/competitions" as Route,
    icon: Trophy
  },
  {
    title: "Leaderboard",
    description: "Track momentum with a lightweight public ranking of active writers.",
    href: "/leaderboard" as Route,
    icon: TrendingUp
  },
  {
    title: "Submissions",
    description: "Track placements and move submissions across project drafts.",
    href: "/submissions" as Route,
    icon: Send
  }
];

const trustPrinciples = [
  "CSV and PDF exports are first-class, not hidden settings.",
  "No script leaves your control without explicit permission.",
  "Every major ranking or recommendation decision is documented."
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
      <section className="space-y-4">
        <article className="hero-card">
          <p className="eyebrow">Writer Hub</p>
          <h1 className="max-w-4xl font-display text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl md:text-5xl lg:text-6xl">
            Build your screenwriting portfolio without losing your history again.
          </h1>
          <p className="max-w-3xl text-base text-ink-700 md:text-lg">
            Script Manifest gives writers a durable home for profiles, projects, submissions, and
            discovery workflows. Your work stays portable and under your control.
          </p>
          <div className="inline-form">
            <Link href="/signin" className="btn btn-primary no-underline">
              Create account
            </Link>
            <Link href="/competitions" className="btn btn-secondary no-underline">
              Browse competitions
            </Link>
          </div>
        </article>

        <section aria-label="Platform capabilities" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {writerSurfaces.map((surface) => (
            <article key={surface.title} className="feature-card">
              <surface.icon className="h-7 w-7 text-ember-500" aria-hidden="true" />
              <h2 className="font-display text-2xl font-semibold text-ink-900">{surface.title}</h2>
              <p className="text-sm text-ink-700">{surface.description}</p>
              <Link href={surface.href} className="text-sm font-semibold text-ember-700 hover:underline">
                Open {surface.title}
              </Link>
            </article>
          ))}
        </section>

        <article className="panel">
          <p className="eyebrow">Trust Contract</p>
          <h2 className="section-title">Writers should not lose years of work overnight.</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            {trustPrinciples.map((principle) => (
              <li key={principle} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ember-500" aria-hidden />
                <span>{principle}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card">
        <p className="eyebrow">Welcome back</p>
        <h2 className="font-display text-4xl font-semibold text-ink-900">{user.displayName}</h2>
        <p className="text-ink-700">Jump directly into your active writer workflow.</p>
      </article>

      <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {writerSurfaces.map((surface) => (
          <article key={surface.title} className="feature-card">
            <surface.icon className="h-7 w-7 text-ember-500" aria-hidden="true" />
            <h3 className="font-display text-2xl font-semibold text-ink-900">{surface.title}</h3>
            <p className="text-sm text-ink-700">{surface.description}</p>
            <Link className="btn btn-secondary no-underline" href={surface.href}>
              Open {surface.title}
            </Link>
          </article>
        ))}
      </section>
    </section>
  );
}
