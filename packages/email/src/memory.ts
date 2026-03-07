import { renderTemplate } from "./templates.js";
import type { EmailService, SendEmailOptions, SentEmail } from "./types.js";

export class MemoryEmailService implements EmailService {
  readonly sentEmails: SentEmail[] = [];

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const rendered = renderTemplate(options.template, options.data);
    this.sentEmails.push({
      to: options.to,
      subject: rendered.subject,
      template: options.template,
      data: options.data,
      sentAt: new Date(),
    });
  }

  getLastEmailTo(address: string): SentEmail | undefined {
    for (let i = this.sentEmails.length - 1; i >= 0; i--) {
      if (this.sentEmails[i]!.to === address) {
        return this.sentEmails[i];
      }
    }
    return undefined;
  }

  getEmailsTo(address: string): SentEmail[] {
    return this.sentEmails.filter((e) => e.to === address);
  }

  clear(): void {
    this.sentEmails.length = 0;
  }
}
