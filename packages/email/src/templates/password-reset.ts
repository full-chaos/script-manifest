import type { RenderedEmail } from "../types.js";

export function renderPasswordReset(data: Record<string, string>): RenderedEmail {
  const resetUrl = data.resetUrl ?? "#";
  const displayName = data.displayName ?? "Writer";

  return {
    subject: "Reset your Script Manifest password",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">Reset your password</h2>
  <p>Hi ${displayName},</p>
  <p>We received a request to reset your password. Click the button below to choose a new one:</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#e85d3a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Reset Password</a>
  </div>
  <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
  <p style="color:#999;font-size:12px;word-break:break-all">Link: ${resetUrl}</p>
</div>`,
    text: `Hi ${displayName},\n\nWe received a request to reset your password. Visit this link to choose a new one:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request a password reset, you can ignore this email.`
  };
}
