"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { readStoredSession } from "../lib/authSession";

const ONBOARDING_DISMISSED_KEY = "onboarding-dismissed";

export function OnboardingChecklist() {
  const [state, setState] = useState({ mounted: false, dismissed: true, emailVerified: false });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const isDismissed = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
      const session = readStoredSession() as { user?: { emailVerified?: boolean }; emailVerified?: boolean } | null;
      const isVerified = (session?.user?.emailVerified ?? session?.emailVerified) === true;

      setState({ mounted: true, dismissed: isDismissed, emailVerified: isVerified });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!state.mounted || state.dismissed) {
    return null;
  }

  const handleDismiss = () => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    setState((prev) => ({ ...prev, dismissed: true }));
  };

  const checklistItems = [
    {
      id: "verify-email",
      label: "Verify email",
      href: "/profile",
      checked: state.emailVerified,
    },
    {
      id: "complete-profile",
      label: "Complete your profile",
      href: "/profile",
      checked: false,
    },
    {
      id: "upload-script",
      label: "Upload your first script",
      href: "/projects",
      checked: false,
    },
    {
      id: "browse-competitions",
      label: "Browse competitions",
      href: "/competitions",
      checked: false,
    },
    {
      id: "explore-coverage",
      label: "Explore coverage services",
      href: "/coverage",
      checked: false,
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
