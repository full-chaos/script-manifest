import type { RenderedEmail } from "../types.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderWelcome(data: Record<string, string>): RenderedEmail {
  const displayName = data.displayName ?? "Writer";

  return {
    subject: "Welcome to Script Manifest!",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a">Welcome aboard, ${esc(displayName)}!</h2>
  <p>Your email has been verified and your account is ready to go.</p>
  <p>Here's what you can do next:</p>
  <ul style="line-height:1.8">
    <li>Set up your writer profile</li>
    <li>Upload your first script</li>
    <li>Browse competitions</li>
    <li>Connect with other writers</li>
  </ul>
  <p>Happy writing!</p>
  <p style="color:#666;font-size:14px">— The Script Manifest Team</p>
</div>`,
    text: `Welcome aboard, ${displayName}!\n\nYour email has been verified and your account is ready to go.\n\nHere's what you can do next:\n- Set up your writer profile\n- Upload your first script\n- Browse competitions\n- Connect with other writers\n\nHappy writing!\n\n— The Script Manifest Team`
  };
}
