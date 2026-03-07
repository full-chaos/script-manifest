import type { EmailService } from "./types.js";

/**
 * Create an EmailService from environment variables.
 *
 * - EMAIL_API_KEY set → ResendEmailService (production)
 * - SMTP_HOST set    → SmtpEmailService   (dev/compose → Mailpit)
 * - Neither          → returns undefined  (emails silently skipped)
 */
export async function createEmailService(): Promise<EmailService | undefined> {
  const apiKey = process.env.EMAIL_API_KEY;
  if (apiKey) {
    const { ResendEmailService } = await import("./resend.js");
    return new ResendEmailService({ apiKey });
  }

  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const { SmtpEmailService } = await import("./smtp.js");
    return new SmtpEmailService({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? "1025"),
      secure: process.env.SMTP_SECURE === "true",
    });
  }

  return undefined;
}
