import type { RenderedEmail } from "../types.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderAccountLockout(data: Record<string, string>): RenderedEmail {
  const displayName = data.displayName ?? "Writer";
  const lockDuration = data.lockDuration ?? "unknown duration";
  const unlockUrl = data.unlockUrl ?? null;

  const html = `<div><h2>Account locked</h2><p>Hi ${esc(displayName)},</p><p>The lock duration is ${esc(lockDuration)}.</p>${unlockUrl ? `<p><a href="${esc(unlockUrl)}">Unlock Account</a></p>` : `<p>Your account will unlock automatically after ${esc(lockDuration)}.</p>`}</div>`;
  const text = `Hi ${displayName},\n\nYour Script Manifest account has been temporarily locked due to multiple failed login attempts or suspicious activity.\n\nThe lock duration is ${lockDuration}.\n\n${unlockUrl ? `Click the link to unlock your account: ${unlockUrl}` : `Your account will unlock automatically after ${lockDuration}.`}\n`;

  return {
    subject: "Your account has been temporarily locked",
    html,
    text
  };
}
