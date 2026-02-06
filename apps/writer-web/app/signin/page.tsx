"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AuthSessionResponse } from "@script-manifest/contracts";
import {
  clearStoredSession,
  formatUserLabel,
  readStoredSession,
  writeStoredSession
} from "../lib/authSession";

type AuthMode = "register" | "login";

export default function SignInPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [status, setStatus] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSession(readStoredSession());
  }, []);

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

  return (
    <section className="card stack">
      <h2>Sign In</h2>
      <p className="muted">Use email credentials for local Phase 1 testing.</p>

      {session ? (
        <div className="stack">
          <p>
            Signed in as <strong>{formatUserLabel(session.user)}</strong>
          </p>
          <p className="muted">Session expires: {new Date(session.expiresAt).toLocaleString()}</p>
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="stack-tight">
            <span>{modeLabel}</span>
            <div className="segmented">
              <button
                type="button"
                className={mode === "login" ? "btn btn-active" : "btn"}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={mode === "register" ? "btn btn-active" : "btn"}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>
          </label>

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

          <button type="submit" className="btn btn-active" disabled={submitting}>
            {submitting ? "Submitting..." : modeLabel}
          </button>
        </form>
      )}

      {status ? <p className="status-note">{status}</p> : null}
    </section>
  );
}
