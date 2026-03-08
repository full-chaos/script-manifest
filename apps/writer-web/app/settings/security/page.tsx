"use client";

import { useState, useCallback, type FormEvent } from "react";
import { readStoredSession } from "../../lib/authSession";

type MfaState =
  | { step: "loading" }
  | { step: "disabled" }
  | { step: "enabled" }
  | { step: "setup"; secret: string; otpauthUrl: string }
  | { step: "verify-setup"; secret: string; otpauthUrl: string }
  | { step: "backup-codes"; codes: string[] }
  | { step: "confirm-disable" };

export default function SecuritySettingsPage() {
  const [session] = useState(() => readStoredSession());
  const [mfaState, setMfaState] = useState<MfaState>({ step: "loading" });
  const [totpCode, setTotpCode] = useState("");
  const [password, setPassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!session?.token) return { "content-type": "application/json" };
    return {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    };
  }, [session]);

  // Load MFA status on first render
  const loadStatus = useCallback(async () => {
    if (!session?.token) return;
    try {
      const res = await fetch("/api/v1/auth/mfa/status", {
        headers: { authorization: `Bearer ${session.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMfaState(data.mfaEnabled ? { step: "enabled" } : { step: "disabled" });
      } else {
        setMfaState({ step: "disabled" });
      }
    } catch {
      setError("Failed to load MFA status.");
      setMfaState({ step: "disabled" });
    } finally {
      setLoaded(true);
    }
  }, [session]);

  // Load on mount
  if (!loaded && session) {
    loadStatus();
  }

  if (!session) {
    return (
      <section className="space-y-4">
        <article className="hero-card animate-in">
          <p className="eyebrow">Settings</p>
          <h1 className="text-4xl text-foreground">Security</h1>
        </article>
        <article className="panel stack mx-auto max-w-md">
          <p className="text-foreground-secondary">
            Please <a href="/signin" className="text-ember-500 hover:underline">sign in</a> to manage security settings.
          </p>
        </article>
      </section>
    );
  }

  async function handleStartSetup() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/setup", {
        method: "POST",
        headers: authHeaders()
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error === "mfa_already_enabled" ? "MFA is already enabled." : (body.error ?? "Setup failed."));
        return;
      }
      const data = await res.json();
      setMfaState({ step: "setup", secret: data.secret, otpauthUrl: data.otpauthUrl });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifySetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/verify-setup", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: totpCode })
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error === "invalid_totp_code" ? "Invalid code. Please try again." : (body.error ?? "Verification failed."));
        return;
      }
      const data = await res.json();
      setTotpCode("");
      setMfaState({ step: "backup-codes", codes: data.backupCodes });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/disable", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password, code: disableCode })
      });
      if (!res.ok) {
        const body = await res.json();
        if (body.error === "invalid_password") {
          setError("Incorrect password.");
        } else if (body.error === "invalid_totp_code") {
          setError("Invalid authentication code.");
        } else {
          setError(body.error ?? "Failed to disable MFA.");
        }
        return;
      }
      setPassword("");
      setDisableCode("");
      setMfaState({ step: "disabled" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyBackupCodes(codes: string[]) {
    navigator.clipboard.writeText(codes.join("\n")).catch(() => {});
  }

  function handleDownloadBackupCodes(codes: string[]) {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "script-manifest-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Settings</p>
        <h1 className="text-4xl text-foreground">Security</h1>
      </article>

      <article className="panel stack mx-auto max-w-lg">
        <h2 className="text-lg font-semibold text-foreground">Two-Factor Authentication (2FA)</h2>
        <p className="text-foreground-secondary text-sm">
          Add an extra layer of security to your account using a time-based one-time password (TOTP)
          authenticator app.
        </p>

        {mfaState.step === "loading" && (
          <p className="text-foreground-secondary text-sm">Loading...</p>
        )}

        {/* MFA disabled — show enable button */}
        {mfaState.step === "disabled" && (
          <button
            type="button"
            className="btn btn-primary w-full justify-center"
            onClick={handleStartSetup}
            disabled={submitting}
          >
            {submitting ? "Starting setup..." : "Enable Two-Factor Authentication"}
          </button>
        )}

        {/* MFA setup — show QR code / otpauth URL */}
        {(mfaState.step === "setup" || mfaState.step === "verify-setup") && (
          <div className="stack">
            <h3 className="font-medium text-foreground">Step 1: Scan QR Code</h3>
            <p className="text-foreground-secondary text-sm">
              Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and scan
              this QR code, or manually enter the secret key.
            </p>

            <div className="p-4 bg-surface-secondary rounded-lg text-center">
              <p className="text-sm text-foreground-secondary mb-2">
                Copy this URL into your authenticator app:
              </p>
              <code className="text-xs break-all text-foreground select-all">
                {mfaState.otpauthUrl}
              </code>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-ember-500 hover:underline">
                Show secret key manually
              </summary>
              <code className="block mt-2 p-2 bg-surface-secondary rounded text-xs select-all text-foreground">
                {mfaState.secret}
              </code>
            </details>

            <hr className="border-border/50" />

            <h3 className="font-medium text-foreground">Step 2: Verify Code</h3>
            <p className="text-foreground-secondary text-sm">
              Enter the 6-digit code from your authenticator app to complete setup.
            </p>

            <form className="stack" onSubmit={handleVerifySetup}>
              <input
                className="input text-center text-2xl tracking-[0.5em] font-mono"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoFocus
                required
              />
              <button
                type="submit"
                className="btn btn-primary w-full justify-center"
                disabled={submitting || totpCode.length !== 6}
              >
                {submitting ? "Verifying..." : "Verify and Enable"}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full justify-center"
                onClick={() => { setMfaState({ step: "disabled" }); setTotpCode(""); setError(""); }}
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Backup codes display */}
        {mfaState.step === "backup-codes" && (
          <div className="stack">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800">
                Save your backup codes!
              </p>
              <p className="text-xs text-amber-700 mt-1">
                These codes can be used to access your account if you lose access to your
                authenticator app. Each code can only be used once. Store them somewhere safe.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 bg-surface-secondary rounded-lg font-mono text-sm">
              {mfaState.codes.map((code) => (
                <div key={code} className="text-foreground select-all">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => handleCopyBackupCodes(mfaState.codes)}
              >
                Copy codes
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => handleDownloadBackupCodes(mfaState.codes)}
              >
                Download
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              onClick={() => setMfaState({ step: "enabled" })}
            >
              I have saved my backup codes
            </button>
          </div>
        )}

        {/* MFA enabled — show status and disable option */}
        {mfaState.step === "enabled" && (
          <div className="stack">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-700">Two-factor authentication is enabled</span>
            </div>
            <button
              type="button"
              className="btn border border-red-500 text-red-600 hover:bg-red-50 w-full justify-center"
              onClick={() => { setMfaState({ step: "confirm-disable" }); setError(""); }}
            >
              Disable Two-Factor Authentication
            </button>
          </div>
        )}

        {/* Confirm disable */}
        {mfaState.step === "confirm-disable" && (
          <form className="stack" onSubmit={handleDisable}>
            <p className="text-sm text-red-600 font-medium">
              To disable two-factor authentication, enter your password and a code from your
              authenticator app.
            </p>

            <label className="stack-tight">
              <span className="text-sm">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="stack-tight">
              <span className="text-sm">Authenticator code</span>
              <input
                className="input text-center font-mono tracking-[0.3em]"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => { setMfaState({ step: "enabled" }); setPassword(""); setDisableCode(""); setError(""); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1"
                disabled={submitting || !password || disableCode.length !== 6}
              >
                {submitting ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          </form>
        )}

        {error ? <p className="status-error">{error}</p> : null}
      </article>
    </section>
  );
}
