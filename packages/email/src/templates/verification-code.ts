import type { RenderedEmail } from "../types.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderVerificationCode(data: Record<string, string>): RenderedEmail {
  const code = data.code ?? "000000";
  const displayName = data.displayName ?? "Writer";

  return {
    subject: `${code} is your Script Manifest verification code`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">Verify your email</h2>
  <p>Hi ${esc(displayName)},</p>
  <p>Enter this code to verify your email address:</p>
  <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#f5f5f5;border-radius:8px;margin:16px 0">${esc(code)}</div>
  <p style="color:#666;font-size:14px">This code expires in 15 minutes. If you didn't create an account, you can ignore this email.</p>
</div>`,
    text: `Hi ${displayName},\n\nYour verification code is: ${code}\n\nThis code expires in 15 minutes. If you didn't create an account, you can ignore this email.`
  };
}
