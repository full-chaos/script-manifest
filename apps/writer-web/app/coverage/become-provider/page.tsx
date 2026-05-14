"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { CoverageProvider, CoverageProviderStatus } from "@script-manifest/contracts";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { useAuth } from "../../lib/AuthProvider";
import { fetcher, ApiError } from "../../lib/fetcher";

const PROVIDERS_KEY = "/api/v1/coverage/providers";

async function registerProvider(
  _key: string,
  { arg }: { arg: { displayName: string; bio: string; specialties: string[] } }
): Promise<{ provider?: CoverageProvider; onboardingUrl?: string }> {
  return fetcher<{ provider?: CoverageProvider; onboardingUrl?: string }>(PROVIDERS_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arg),
  });
}

export default function BecomeProviderPage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? "";
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [gettingOnboardingLink, setGettingOnboardingLink] = useState(false);

  // Auth-paused: do not fetch until auth resolves and user is known
  const providersKey = authLoading || !userId ? null : PROVIDERS_KEY;

  const { data: providersData, isLoading: providersLoading, mutate: mutateProviders } = useSWR<{ providers: CoverageProvider[] }>(
    providersKey,
    fetcher,
    {
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to load provider data.");
      },
    }
  );

  const userProvider = userId
    ? (providersData?.providers?.find((p) => p.userId === userId) ?? null)
    : null;

  const { trigger: triggerRegister, isMutating: registering } = useSWRMutation(
    providersKey,
    registerProvider,
    {
      throwOnError: false,
      onSuccess(data) {
        toast.success("Provider profile created!");
        void mutateProviders();
        if (data.onboardingUrl) {
          toast.info("Redirecting to Stripe onboarding...");
          window.location.href = data.onboardingUrl;
        }
      },
      onError(err: unknown) {
        toast.error(err instanceof ApiError ? err.message : "Failed to register as provider.");
      },
    }
  );

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const specialtiesArray = specialties.split(",").map((s) => s.trim()).filter(Boolean);
    await triggerRegister({ displayName, bio, specialties: specialtiesArray });
  }

  async function handleGetOnboardingLink() {
    if (!userProvider) return;
    setGettingOnboardingLink(true);
    try {
      const data = await fetcher<{ url?: string }>(
        `/api/v1/coverage/providers/${encodeURIComponent(userProvider.id)}/stripe-onboarding`,
        { method: "GET" }
      );
      if (!data.url) {
        toast.error("Onboarding link is unavailable right now. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to get onboarding link.");
    } finally {
      setGettingOnboardingLink(false);
    }
  }

  function formatProviderStatus(status: CoverageProviderStatus): string {
    const labels: Record<CoverageProviderStatus, string> = {
      pending_verification: "Pending verification",
      active: "Active",
      suspended: "Suspended",
      deactivated: "Deactivated"
    };
    return labels[status];
  }

  function getStatusNotice(currentProvider: CoverageProvider): { title: string; message: string; tone: "amber" | "red" | "ink" } | null {
    if (currentProvider.status === "pending_verification") {
      if (!currentProvider.stripeOnboardingComplete) {
        return {
          tone: "amber",
          title: "Action required: complete Stripe setup",
          message: "Finish Stripe onboarding to verify your payout account and enable provider activation."
        };
      }

      return {
        tone: "amber",
        title: "Verification in progress",
        message: "Your Stripe setup is complete. Our team is reviewing your provider profile before activation."
      };
    }

    if (currentProvider.status === "suspended") {
      return {
        tone: "red",
        title: "Account suspended",
        message: "Your provider account is currently suspended. You cannot accept new orders. Contact support for next steps."
      };
    }

    if (currentProvider.status === "deactivated") {
      return {
        tone: "ink",
        title: "Account deactivated",
        message: "Your provider profile is deactivated and hidden from the marketplace. Contact support to discuss reactivation."
      };
    }

    return null;
  }

  const isLoading = authLoading || providersLoading;

  if (isLoading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
      </section>
    );
  }

  if (!userId) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Become a Provider</p>
          <h1 className="text-4xl text-foreground">Join our marketplace</h1>
          <p className="max-w-3xl text-foreground-secondary">
            Sign in to register as a coverage provider and start offering services.
          </p>
        </article>
      </section>
    );
  }

  if (userProvider) {
    const statusNotice = getStatusNotice(userProvider);

    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Provider Status</p>
          <h1 className="text-4xl text-foreground">{userProvider.displayName}</h1>
          <p className="max-w-3xl text-foreground-secondary">{userProvider.bio}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              userProvider.status === "active"
                ? "border-green-300 bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-400"
                : userProvider.status === "pending_verification"
                ? "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-500"
                : userProvider.status === "suspended"
                ? "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15 text-red-700 dark:text-red-300"
                : "border-border/65 bg-ink-500/10 text-muted"
            }`}>
              {formatProviderStatus(userProvider.status)}
            </span>
            {userProvider.stripeOnboardingComplete ? (
              <span className="inline-flex items-center rounded-full border border-green-300 bg-green-500/10 dark:bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:text-green-400">
                Stripe connected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-500">
                Stripe setup incomplete
              </span>
            )}
          </div>
        </article>

        <article className="panel stack animate-in animate-in-delay-1">
          <h2 className="section-title">Provider Actions</h2>
          <div className="inline-form">
            <a href="/coverage/dashboard" className="btn btn-primary no-underline">
              Go to Dashboard
            </a>
            {userProvider.status === "pending_verification" && !userProvider.stripeOnboardingComplete ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleGetOnboardingLink()}
                disabled={gettingOnboardingLink}
              >
                {gettingOnboardingLink ? "Loading..." : "Complete Stripe Setup"}
              </button>
            ) : null}
          </div>
        </article>

        {statusNotice ? (
          <article className="panel stack animate-in animate-in-delay-2">
            <div className={`rounded-lg border p-4 ${
              statusNotice.tone === "amber"
                ? "border-amber-400/60 dark:border-amber-300/45 bg-amber-500/10 dark:bg-amber-500/15"
                : statusNotice.tone === "red"
                ? "border-red-400/60 dark:border-red-300/45 bg-red-500/10 dark:bg-red-500/15"
                : "border-border/65 bg-ink-500/5"
            }`}>
              <strong className={`text-sm font-semibold ${
                statusNotice.tone === "amber"
                  ? "text-amber-900 dark:text-amber-300"
                  : statusNotice.tone === "red"
                  ? "text-red-900"
                  : "text-foreground"
              }`}>
                {statusNotice.title}
              </strong>
              <p className={`mt-1 text-sm ${
                statusNotice.tone === "amber"
                  ? "text-amber-700 dark:text-amber-500"
                  : statusNotice.tone === "red"
                  ? "text-red-700 dark:text-red-400"
                  : "text-foreground-secondary"
              }`}>
                {statusNotice.message}
              </p>
            </div>
          </article>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--violet animate-in">
        <p className="eyebrow">Become a Provider</p>
        <h1 className="text-4xl text-foreground">Join our marketplace</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Register as a coverage provider to offer professional script feedback services.
          After registration, you&apos;ll complete Stripe onboarding to receive payments.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Provider Registration</h2>
        <form className="stack" onSubmit={(e) => void handleRegister(e)}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Display Name</span>
            <input
              className="input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Smith Coverage"
              required
              maxLength={200}
            />
            <span className="text-xs text-muted">
              The name that will appear on your provider profile
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Bio</span>
            <textarea
              className="input min-h-32"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell writers about your experience and approach to coverage..."
              maxLength={5000}
            />
            <span className="text-xs text-muted">
              Describe your background and what writers can expect from your coverage
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-foreground">Specialties</span>
            <input
              className="input"
              type="text"
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder="Drama, Sci-Fi, Character-driven stories"
            />
            <span className="text-xs text-muted">
              Comma-separated list of genres and formats you specialise in
            </span>
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={registering}>
              {registering ? "Registering..." : "Register as Provider"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
