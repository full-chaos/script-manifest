"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { clearStoredSession, readStoredSession } from "../../lib/authSession";

export default function AccountSettingsPage() {
  const [session] = useState(() => readStoredSession());
  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  async function handleDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/auth/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session?.token ?? ""}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json();
        if (body.error === "invalid_password") {
          setError("Incorrect password. Please try again.");
        } else {
          setError(body.error ?? "Something went wrong.");
        }
        return;
      }

      clearStoredSession();
      setDeleted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <section className="space-y-4">
        <article className="hero-card animate-in">
          <p className="eyebrow">Settings</p>
          <h1 className="text-4xl text-foreground">Account Settings</h1>
        </article>
        <article className="panel stack mx-auto max-w-md">
          <p className="text-foreground-secondary">
            Please <a href="/signin" className="text-ember-500 hover:underline">sign in</a> to manage your account.
          </p>
        </article>
      </section>
    );
  }

  if (deleted) {
    return (
      <section className="space-y-4">
        <article className="hero-card animate-in">
          <p className="eyebrow">Settings</p>
          <h1 className="text-4xl text-foreground">Account Deleted</h1>
        </article>
        <article className="panel stack mx-auto max-w-md">
          <p className="text-foreground-secondary">
            Your account has been scheduled for deletion. You have 30 days to change your mind
            by contacting support. After that, all your data will be permanently removed.
          </p>
          <Link href="/" className="btn btn-secondary w-full justify-center">
            Go to homepage
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Settings</p>
        <h1 className="text-4xl text-foreground">Account Settings</h1>
      </article>

      <article className="panel stack mx-auto max-w-md">
        <div className="stack">
          <h2 className="text-lg font-semibold text-foreground">Account Information</h2>
          <p className="text-foreground-secondary text-sm">
            Email: <strong>{session.user.email}</strong>
          </p>
          <p className="text-foreground-secondary text-sm">
            Display name: <strong>{session.user.displayName}</strong>
          </p>
        </div>

        <hr className="border-border/50" />

        <div className="stack">
          <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>

          {!showConfirm ? (
            <div>
              <p className="text-foreground-secondary text-sm mb-3">
                Permanently delete your account and all associated data. This action has a 30-day
                grace period before data is permanently removed.
              </p>
              <button
                type="button"
                className="btn border border-red-500 text-red-600 hover:bg-red-50"
                onClick={() => setShowConfirm(true)}
              >
                Delete Account
              </button>
            </div>
          ) : (
            <form className="stack" onSubmit={handleDelete}>
              <p className="text-sm text-red-600 font-medium">
                Are you sure? This will:
              </p>
              <ul className="text-sm text-foreground-secondary list-disc pl-5 space-y-1">
                <li>Mark your account for deletion (30-day grace period)</li>
                <li>Immediately sign you out of all sessions</li>
                <li>Remove your profile, projects, and submissions after 30 days</li>
              </ul>

              <label className="stack-tight">
                <span className="text-sm">Confirm your password</span>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => { setShowConfirm(false); setPassword(""); setError(""); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn bg-red-600 text-white hover:bg-red-700 flex-1"
                  disabled={submitting || !password}
                >
                  {submitting ? "Deleting..." : "Delete my account"}
                </button>
              </div>
            </form>
          )}
        </div>

        {error ? <p className="status-error">{error}</p> : null}
      </article>
    </section>
  );
}
