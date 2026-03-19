import { Resend } from "resend";
import { renderTemplate } from "./templates.js";
import type { EmailService, SendEmailOptions } from "./types.js";

type RateLimitEntry = { count: number; windowStart: number };

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class ResendEmailService implements EmailService {
  private readonly client: Resend;
  private readonly from: string;
  private readonly rateLimits = new Map<string, RateLimitEntry>();

  constructor(options?: { apiKey?: string; from?: string }) {
    const apiKey = options?.apiKey ?? process.env.EMAIL_API_KEY ?? "";
    this.from = options?.from ?? process.env.EMAIL_FROM ?? "noreply@scriptmanifest.com";
    this.client = new Resend(apiKey);
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    this.checkRateLimit(options.to);

    const rendered = renderTemplate(options.template, options.data);

    const { error } = await this.client.emails.send({
      from: this.from,
      to: options.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (error) {
      throw new Error(`Resend API error [${error.name}]: ${error.message}`);
    }
  }

  private checkRateLimit(to: string): void {
    const now = Date.now();
    const entry = this.rateLimits.get(to);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      // Delete stale entry before replacing (prunes expired keys on access)
      if (entry) {
        this.rateLimits.delete(to);
      }
      this.rateLimits.set(to, { count: 1, windowStart: now });
      return;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
      throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX} emails per hour to ${to}`);
    }

    entry.count++;
  }

  /** Prune all expired rate-limit entries. Call periodically to prevent unbounded Map growth. */
  pruneExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimits) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        this.rateLimits.delete(key);
      }
    }
  }
}
