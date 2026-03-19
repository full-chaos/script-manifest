"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { readStoredSession, writeStoredSession } from "../lib/authSession";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [session] = useState(() => readStoredSession());
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  if (!session) {
    return (
      <section className="space-y-4" data-testid="verify-email-page">
        <article className="hero-card animate-in">
          <p className="eyebrow">Account</p>
          <h1 className="text-4xl text-foreground">Verify your email</h1>
        </article>
        <article className="panel stack mx-auto max-w-md text-center">
          <p className="text-foreground-secondary">
            Please <Link href="/signin" className="text-ember-500 hover:underline">sign in</Link> to verify your email.
          </p>
        </article>
      </section>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    
    try {
      const res = await fetch("/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code })
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many attempts. Please try again later.");
          return;
        }
        
        try {
          const body = await res.json();
          setError(body.error ?? "Invalid or expired code. Please try again.");
        } catch {
          setError("Invalid or expired code. Please try again.");
        }
        return;
      }
      
      try {
        const data = await res.json();
        if (data && typeof data === "object" && "token" in data && data.token) {
          writeStoredSession(data);
        }
      } catch {
      }
      
      router.replace("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setSuccess("");
    setResending(true);
    
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: session?.user.email })
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many attempts. Please try again later.");
          return;
        }
        
        try {
          const body = await res.json();
          setError(body.error ?? "Failed to resend code. Please try again.");
        } catch {
          setError("Failed to resend code. Please try again.");
        }
        return;
      }
      
      setSuccess("Verification code sent to your email.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <section className="space-y-4" data-testid="verify-email-page">
      <article className="hero-card animate-in">
        <p className="eyebrow">Account</p>
        <h1 className="text-4xl text-foreground">Verify your email</h1>
      </article>

      <article className="panel stack mx-auto max-w-lg">
        <p className="text-foreground-secondary text-sm">
          We sent a 6-digit verification code to <strong className="text-foreground font-medium">{session.user.email}</strong>.
          Please enter it below to verify your email address.
        </p>

        <form className="stack" onSubmit={handleSubmit}>
          <input
            className="input text-center text-2xl tracking-[0.5em] font-mono"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            required
          />
          <button
            type="submit"
            className="btn btn-primary w-full justify-center"
            disabled={submitting || code.length !== 6}
          >
            {submitting ? "Verifying..." : "Verify Email"}
          </button>
        </form>

        <hr className="border-border/50" />

        <div className="stack-tight">
          <p className="text-sm text-foreground-secondary">
            Didn&apos;t receive the code?
          </p>
          <button
            type="button"
            className="btn btn-secondary w-full justify-center"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Sending..." : "Resend code"}
          </button>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {success ? <p className="text-sm text-green-600 font-medium">{success}</p> : null}

        <div className="pt-2 text-center">
          <Link href="/" className="text-sm text-ember-500 hover:underline">
            Back to home
          </Link>
        </div>
      </article>
    </section>
  );
}
