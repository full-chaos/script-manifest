"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useSyncExternalStore, useState } from "react";
import type { AuthUser } from "@script-manifest/contracts";
import { FolderOpen, Send, Trophy, TrendingUp, UserPen, type LucideIcon } from "lucide-react";
import { SESSION_CHANGED_EVENT, readStoredSession } from "../lib/authSession";
import { HeroIllustration, TrustIllustration } from "./illustrations";
import { OnboardingChecklist } from "./OnboardingChecklist";

type SurfaceIconKey = "profile" | "projects" | "competitions" | "leaderboard" | "submissions";

type Surface = {
  title: string;
  description: string;
  href: Route;
  iconKey: SurfaceIconKey;
};

type AuthBannerProps = {
  writerSurfaces: Surface[];
  trustPrinciples: string[];
};

const surfaceIcons: Record<SurfaceIconKey, LucideIcon> = {
  profile: UserPen,
  projects: FolderOpen,
  competitions: Trophy,
  leaderboard: TrendingUp,
  submissions: Send
};

function SurfaceIcon({ iconKey }: { iconKey: SurfaceIconKey }) {
  const Icon = surfaceIcons[iconKey];
  return <Icon className="h-7 w-7 text-primary" aria-hidden="true" />;
}

export function AuthBanner({ writerSurfaces, trustPrinciples }: AuthBannerProps) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    const syncSession = () => {
      setUser(readStoredSession()?.user ?? null);
      onStoreChange();
    };
    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener(SESSION_CHANGED_EVENT, syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  if (!mounted) {
    return null;
  }

  if (!user) {
    return (
      <section className="space-y-4">
        <article className="hero-card animate-in relative overflow-hidden">
          <div className="relative z-10">
            <p className="eyebrow">Writer Hub</p>
            <h1 className="max-w-4xl font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
              Build your screenwriting portfolio without losing your history again.
            </h1>
            <p className="max-w-3xl text-base text-foreground-secondary md:text-lg">
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
          </div>
          <HeroIllustration className="pointer-events-none absolute -right-4 -bottom-4 hidden w-56 text-foreground opacity-60 md:block" />
        </article>

        <section aria-label="Platform capabilities" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 animate-stagger">
          {writerSurfaces.map((surface) => (
            <article key={surface.title} className="feature-card">
              <SurfaceIcon iconKey={surface.iconKey} />
              <h2 className="font-display text-2xl font-semibold text-foreground">{surface.title}</h2>
              <p className="text-sm text-foreground-secondary">{surface.description}</p>
              <Link href={surface.href} className="text-sm font-semibold text-primary-dark dark:text-primary hover:underline">
                Open {surface.title}
              </Link>
            </article>
          ))}
        </section>

        <article className="panel animate-in animate-in-delay-1">
          <div className="flex items-start gap-5">
            <TrustIllustration className="hidden w-16 shrink-0 text-foreground sm:block" />
            <div>
              <p className="eyebrow">Trust Contract</p>
              <h2 className="section-title">Writers should not lose years of work overnight.</h2>
              <ul className="mt-3 space-y-2 text-sm text-foreground-secondary">
                {trustPrinciples.map((principle) => (
                  <li key={principle} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ember-500" aria-hidden />
                    <span>{principle}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Welcome back</p>
        <h2 className="font-display text-4xl font-semibold text-foreground">{user.displayName}</h2>
        <p className="text-foreground-secondary">Jump directly into your active writer workflow.</p>
      </article>

      <OnboardingChecklist />

      <section aria-label="Quick actions" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 animate-stagger">
        {writerSurfaces.map((surface) => (
          <article key={surface.title} className="feature-card">
            <SurfaceIcon iconKey={surface.iconKey} />
            <h3 className="font-display text-2xl font-semibold text-foreground">{surface.title}</h3>
            <p className="text-sm text-foreground-secondary">{surface.description}</p>
            <Link className="btn btn-secondary no-underline" href={surface.href}>
              Open {surface.title}
            </Link>
          </article>
        ))}
      </section>
    </section>
  );
}
