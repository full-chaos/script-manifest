"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CoverageProvider } from "@script-manifest/contracts";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { getAuthHeaders, readStoredSession } from "../../lib/authSession";

export default function BecomeProviderPage() {
  const toast = useToast();
  const [signedInUserId, setSignedInUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<CoverageProvider | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [registering, setRegistering] = useState(false);
  const [gettingOnboardingLink, setGettingOnboardingLink] = useState(false);

  useEffect(() => {
    const session = readStoredSession();
    if (session) {
      setSignedInUserId(session.user.id);
    }
  }, []);

  const loadProvider = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/coverage/providers", {
        headers: getAuthHeaders(),
        cache: "no-store"
      });

      if (response.ok) {
        const body = (await response.json()) as { providers?: CoverageProvider[] };
        const userProvider = body.providers?.find((p) => p.userId === signedInUserId);
        setProvider(userProvider ?? null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load provider data.");
    } finally {
      setLoading(false);
    }
  }, [signedInUserId, toast]);

  useEffect(() => {
    if (signedInUserId) {
      void loadProvider();
    }
  }, [signedInUserId, loadProvider]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegistering(true);
    try {
      const specialtiesArray = specialties.split(",").map((s) => s.trim()).filter(Boolean);
      const response = await fetch("/api/v1/coverage/providers", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ displayName, bio, specialties: specialtiesArray })
      });

      const body = (await response.json()) as { provider?: CoverageProvider; onboardingUrl?: string; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to register as provider.");
        return;
      }

      setProvider(body.provider ?? null);
      toast.success("Provider profile created!");

      if (body.onboardingUrl) {
        toast.info("Redirecting to Stripe onboarding...");
        window.location.href = body.onboardingUrl;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to register as provider.");
    } finally {
      setRegistering(false);
    }
  }

  async function handleGetOnboardingLink() {
    if (!provider) return;

    setGettingOnboardingLink(true);
    try {
      const response = await fetch(`/api/v1/coverage/providers/${encodeURIComponent(provider.id)}/stripe-onboarding`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      const body = (await response.json()) as { onboardingUrl?: string; error?: string };
      if (!response.ok) {
        toast.error(body.error ?? "Failed to get onboarding link.");
        return;
      }

      if (body.onboardingUrl) {
        window.location.href = body.onboardingUrl;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get onboarding link.");
    } finally {
      setGettingOnboardingLink(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
      </section>
    );
  }

  if (!signedInUserId) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Become a Provider</p>
          <h1 className="text-4xl text-ink-900">Join our marketplace</h1>
          <p className="max-w-3xl text-ink-700">
            Sign in to register as a coverage provider and start offering services.
          </p>
        </article>
      </section>
    );
  }

  if (provider) {
    return (
      <section className="space-y-4">
        <article className="hero-card hero-card--violet animate-in">
          <p className="eyebrow">Provider Status</p>
          <h1 className="text-4xl text-ink-900">{provider.displayName}</h1>
          <p className="max-w-3xl text-ink-700">{provider.bio}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              provider.status === "active"
                ? "border-green-300 bg-green-50 text-green-700"
                : provider.status === "pending_verification"
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-ink-500/20 bg-ink-500/10 text-ink-500"
            }`}>
              {provider.status.replace(/_/g, " ")}
            </span>
            {provider.stripeOnboardingComplete ? (
              <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                Stripe connected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
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
            {!provider.stripeOnboardingComplete ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGetOnboardingLink}
                disabled={gettingOnboardingLink}
              >
                {gettingOnboardingLink ? "Loading..." : "Complete Stripe Setup"}
              </button>
            ) : null}
          </div>
        </article>

        {!provider.stripeOnboardingComplete ? (
          <article className="panel stack animate-in animate-in-delay-2">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <strong className="text-sm font-semibold text-amber-900">Action Required</strong>
              <p className="mt-1 text-sm text-amber-700">
                You must complete Stripe onboarding to receive payments for your services.
                Click &quot;Complete Stripe Setup&quot; above to continue.
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
        <h1 className="text-4xl text-ink-900">Join our marketplace</h1>
        <p className="max-w-3xl text-ink-700">
          Register as a coverage provider to offer professional script feedback services.
          After registration, you&apos;ll complete Stripe onboarding to receive payments.
        </p>
      </article>

      <article className="panel stack animate-in animate-in-delay-1">
        <h2 className="section-title">Provider Registration</h2>
        <form className="stack" onSubmit={handleRegister}>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Display Name</span>
            <input
              className="input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Smith Coverage"
              required
              maxLength={200}
            />
            <span className="text-xs text-ink-500">
              The name that will appear on your provider profile
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Bio</span>
            <textarea
              className="input min-h-32"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell writers about your experience and approach to coverage..."
              maxLength={5000}
            />
            <span className="text-xs text-ink-500">
              Describe your background and what writers can expect from your coverage
            </span>
          </label>
          <label className="stack-tight">
            <span className="text-sm font-medium text-ink-900">Specialties</span>
            <input
              className="input"
              type="text"
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              placeholder="Drama, Sci-Fi, Character-driven stories"
            />
            <span className="text-xs text-ink-500">
              Comma-separated list of genres or types of scripts you specialize in
            </span>
          </label>
          <div className="inline-form">
            <button type="submit" className="btn btn-primary" disabled={registering}>
              {registering ? "Registering..." : "Register as Provider"}
            </button>
          </div>
        </form>
      </article>

      <article className="panel stack animate-in animate-in-delay-2">
        <h2 className="section-title">What happens next?</h2>
        <div className="stack-tight">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tide-500/10 text-sm font-semibold text-tide-700">
              1
            </span>
            <div className="flex-1">
              <strong className="text-sm text-ink-900">Complete registration</strong>
              <p className="text-sm text-ink-700">Fill out the form above to create your provider profile.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tide-500/10 text-sm font-semibold text-tide-700">
              2
            </span>
            <div className="flex-1">
              <strong className="text-sm text-ink-900">Stripe onboarding</strong>
              <p className="text-sm text-ink-700">
                Connect your Stripe account to receive payments for your services.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tide-500/10 text-sm font-semibold text-tide-700">
              3
            </span>
            <div className="flex-1">
              <strong className="text-sm text-ink-900">Create services</strong>
              <p className="text-sm text-ink-700">
                Set up coverage service offerings with pricing and turnaround times.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tide-500/10 text-sm font-semibold text-tide-700">
              4
            </span>
            <div className="flex-1">
              <strong className="text-sm text-ink-900">Start accepting orders</strong>
              <p className="text-sm text-ink-700">
                Writers can now discover your services and place orders through the marketplace.
              </p>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
