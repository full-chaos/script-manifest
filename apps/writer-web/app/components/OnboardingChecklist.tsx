"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CheckCircle2, Circle, X } from "lucide-react";
import type { OnboardingStatus } from "@script-manifest/contracts";

const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed";

type ChecklistState = {
  mounted: boolean;
  dismissed: boolean;
  status: OnboardingStatus | null;
};

export function OnboardingChecklist() {
  const [state, setState] = useState<ChecklistState>({
    mounted: false,
    dismissed: true,
    status: null,
  });

  useEffect(() => {
    const isDismissed = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";

    if (isDismissed) {
      setState({ mounted: true, dismissed: true, status: null });
      return;
    }

    let cancelled = false;

    async function fetchStatus() {
      try {
        const response = await fetch("/api/v1/onboarding-status", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { status?: OnboardingStatus };
        if (cancelled) return;
        setState({
          mounted: true,
          dismissed: false,
          status: body.status ?? null,
        });
      } catch {
        if (!cancelled) {
          setState({ mounted: true, dismissed: false, status: null });
        }
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mounted pattern requires client-side localStorage + async fetch
    setState((prev) => ({ ...prev, mounted: true, dismissed: false }));
    void fetchStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!state.mounted || state.dismissed) {
    return null;
  }

  const handleDismiss = () => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    setState((prev) => ({ ...prev, dismissed: true }));
  };

  const s = state.status;

  const checklistItems = [
    {
      id: "verify-email",
      label: "Verify email",
      href: "/verify-email" as Route,
      checked: s?.emailVerified ?? false,
    },
    {
      id: "complete-profile",
      label: "Complete your profile",
      href: "/profile" as Route,
      checked: s?.profileCompleted ?? false,
    },
    {
      id: "upload-script",
      label: "Upload your first script",
      href: "/projects" as Route,
      checked: s?.firstScriptUploaded ?? false,
    },
    {
      id: "browse-competitions",
      label: "Browse competitions",
      href: "/competitions" as Route,
      checked: s?.competitionsVisited ?? false,
    },
    {
      id: "explore-coverage",
      label: "Explore coverage services",
      href: "/coverage" as Route,
      checked: s?.coverageVisited ?? false,
    },
  ];

  return (
    <div className="panel card mb-6 relative animate-in" data-testid="onboarding-checklist">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-4 top-4 text-foreground-secondary hover:text-foreground p-1 transition-colors"
        aria-label="Dismiss checklist"
      >
        <X className="h-5 w-5" />
      </button>

      <h2 className="font-display text-xl font-semibold text-foreground mb-4">Getting Started</h2>
      
      <ul className="space-y-3">
        {checklistItems.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            {item.checked ? (
              <CheckCircle2 className="h-5 w-5 text-tide-600 dark:text-tide-500" data-testid={`check-${item.id}`} />
            ) : (
              <Circle className="h-5 w-5 text-foreground-secondary/40" data-testid={`uncheck-${item.id}`} />
            )}
            
            {item.checked ? (
              <span className="text-foreground-secondary line-through text-sm">{item.label}</span>
            ) : (
              <Link href={item.href} className="text-primary hover:underline font-medium text-sm">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      
      <div className="mt-5">
        <button type="button" onClick={handleDismiss} className="btn btn-secondary text-xs px-3 py-1.5 h-auto">
          Dismiss
        </button>
      </div>
    </div>
  );
}
