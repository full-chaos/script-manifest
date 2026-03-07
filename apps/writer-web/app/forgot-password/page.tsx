"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Something went wrong.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Account</p>
        <h1 className="text-4xl text-foreground">Reset your password</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </article>

      <article className="panel stack mx-auto max-w-md">
        {submitted ? (
          <div className="stack">
            <p className="text-foreground">Check your email</p>
            <p className="text-foreground-secondary text-sm">
              If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              Check your inbox and spam folder.
            </p>
            <Link href="/signin" className="btn btn-secondary w-full justify-center">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="stack" onSubmit={handleSubmit}>
            <label className="stack-tight">
              <span>Email address</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={submitting}
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>

            <Link href="/signin" className="text-sm text-ember-500 hover:underline text-center">
              Back to sign in
            </Link>
          </form>
        )}

        {error ? <p className="status-error">{error}</p> : null}
      </article>
    </section>
  );
}
