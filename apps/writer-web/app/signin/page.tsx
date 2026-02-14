"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AuthSessionResponse } from "@script-manifest/contracts";
import {
  clearStoredSession,
  formatUserLabel,
  readStoredSession,
  writeStoredSession
} from "../lib/authSession";
import { SignInIllustration } from "../components/illustrations";

type AuthMode = "register" | "login";

export default function SignInPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [status, setStatus] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);

  // On mount: restore session + handle Google OAuth callback redirect
  useEffect(() => {
    setSession(readStoredSession());

    // Detect ?code=&state= query params from Google OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      // Clear query params from URL to prevent replay
      window.history.replaceState({}, "", window.location.pathname);
      void completeOAuthFromRedirect(state, code);
    }
  }, []);

  async function completeOAuthFromRedirect(state: string, code: string) {
    setOauthSubmitting(true);
    setStatus("");

    try {
      const completeResponse = await fetch("/api/v1/auth/oauth/google/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, code })
      });
      const completeBody = await completeResponse.json();
      if (!completeResponse.ok) {
        setStatus(
          completeBody.error ? `Error: ${completeBody.error}` : "OAuth callback failed."
        );
        return;
      }

      writeStoredSession(completeBody as AuthSessionResponse);
      setSession(completeBody as AuthSessionResponse);
      setPassword("");
      setStatus("Signed in with Google.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setOauthSubmitting(false);
    }
  }

  const modeLabel = useMemo(() => (mode === "register" ? "Create account" : "Sign in"), [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setSubmitting(true);

    try {
      const payload =
        mode === "register"
          ? { email, password, displayName }
          : {
              email,
              password
            };
      const response = await fetch(
        mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ? `Error: ${body.error}` : "Unable to authenticate.");
        return;
      }

      writeStoredSession(body as AuthSessionResponse);
      setSession(body as AuthSessionResponse);
      setPassword("");
      setStatus(mode === "register" ? "Account created." : "Signed in.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    const token = session?.token;
    setStatus("");

    try {
      if (token) {
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`
          }
        });
      }
    } finally {
      clearStoredSession();
      setSession(null);
      setStatus("Signed out.");
    }
  }

  async function signInWithGoogle() {
    setStatus("");
    setOauthSubmitting(true);

    try {
      const startResponse = await fetch("/api/v1/auth/oauth/google/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loginHint: email.trim() || displayName.trim() || "writer"
        })
      });
      const startBody = await startResponse.json();
      if (!startResponse.ok) {
        setStatus(startBody.error ? `Error: ${startBody.error}` : "Unable to start OAuth flow.");
        return;
      }

      const authorizationUrl = new URL(startBody.authorizationUrl as string);

      // Real Google OAuth: redirect the browser to Google
      if (authorizationUrl.hostname === "accounts.google.com") {
        window.location.href = authorizationUrl.toString();
        return;
      }

      // Mock flow: extract state/code from the mock authorization URL and complete inline
      const state = authorizationUrl.searchParams.get("state");
      const code = authorizationUrl.searchParams.get("code");
      if (!state || !code) {
        setStatus("OAuth start payload missing state/code.");
        return;
      }

      const callbackResponse = await fetch(
        `/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
        { method: "GET" }
      );
      const callbackBody = await callbackResponse.json();
      if (!callbackResponse.ok) {
        setStatus(callbackBody.error ? `Error: ${callbackBody.error}` : "OAuth callback failed.");
        return;
      }

      writeStoredSession(callbackBody as AuthSessionResponse);
      setSession(callbackBody as AuthSessionResponse);
      setPassword("");
      setStatus("Signed in with Google.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "unknown_error");
    } finally {
      setOauthSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in relative overflow-hidden">
        <div className="relative z-10">
          <p className="eyebrow">Account</p>
          <h1 className="text-4xl text-ink-900">Sign in to your writer hub</h1>
          <p className="max-w-3xl text-ink-700">
            Access your profile, manage projects, and track competition submissions — all in one place.
          </p>
        </div>
        <SignInIllustration className="pointer-events-none absolute -right-2 -bottom-2 hidden w-48 text-ink-900 opacity-50 md:block" />
      </article>

      <article className="panel stack mx-auto max-w-md">

        {session ? (
          <div className="stack">
            <p>
              Signed in as <strong>{formatUserLabel(session.user)}</strong>
            </p>
            <p className="muted">Session expires: {new Date(session.expiresAt).toLocaleString()}</p>
            <div className="inline-form">
              <button type="button" className="btn btn-secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="flex overflow-hidden rounded-lg border border-ink-500/20">
              <button
                type="button"
                className={
                  mode === "login"
                    ? "flex-1 px-4 py-2 text-sm font-semibold bg-ember-500 text-white transition-colors"
                    : "flex-1 px-4 py-2 text-sm font-semibold bg-white text-ink-700 hover:bg-cream-100 transition-colors"
                }
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={
                  mode === "register"
                    ? "flex-1 px-4 py-2 text-sm font-semibold bg-ember-500 text-white transition-colors"
                    : "flex-1 px-4 py-2 text-sm font-semibold bg-white text-ink-700 hover:bg-cream-100 transition-colors"
                }
                onClick={() => setMode("register")}
              >
                Create account
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              onClick={() => void signInWithGoogle()}
              disabled={oauthSubmitting}
            >
              {oauthSubmitting ? "Connecting..." : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-ink-500/15" />
              <span className="text-xs text-ink-500">or continue with email</span>
              <div className="h-px flex-1 bg-ink-500/15" />
            </div>

            {mode === "register" ? (
              <label className="stack-tight">
                <span>Display name</span>
                <input
                  className="input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </label>
            ) : null}

            <label className="stack-tight">
              <span>Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="stack-tight">
              <span>Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            <button type="submit" className="btn btn-secondary w-full justify-center" disabled={submitting}>
              {submitting ? "Submitting..." : modeLabel}
            </button>
          </form>
        )}
      </article>

      {status ? <p className={status.startsWith("Error:") ? "status-error" : "status-note"}>{status}</p> : null}
    </section>
  );
}
