"use client";

import { useState, type FormEvent, useEffect } from "react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const body = await res.json();
        if (body.error === "invalid_or_expired_token") {
          setError("This reset link has expired or already been used. Please request a new one.");
        } else {
          setError(body.error ?? "Something went wrong.");
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token && !success) {
    return (
      <section className="space-y-4">
        <article className="hero-card animate-in">
          <p className="eyebrow">Account</p>
          <h1 className="text-4xl text-foreground">Reset your password</h1>
        </article>
        <article className="panel stack mx-auto max-w-md">
          <p className="text-foreground-secondary">
            Invalid reset link. Please request a new password reset from the{" "}
            <a href="/forgot-password" className="text-ember-500 hover:underline">forgot password</a> page.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Account</p>
        <h1 className="text-4xl text-foreground">Set a new password</h1>
      </article>

      <article className="panel stack mx-auto max-w-md">
        {success ? (
          <div className="stack">
            <p className="text-foreground">Password reset successfully!</p>
            <p className="text-foreground-secondary text-sm">
              You can now sign in with your new password. All previous sessions have been invalidated.
            </p>
            <Link href="/signin" className="btn btn-primary w-full justify-center">
              Sign in
            </Link>
          </div>
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <label className="stack-tight">
              <span>New password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoFocus
              />
            </label>

            <label className="stack-tight">
              <span>Confirm password</span>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={submitting || password.length < 8 || password !== confirmPassword}
            >
              {submitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        {error ? <p className="status-error">{error}</p> : null}
      </article>
    </section>
  );
}
