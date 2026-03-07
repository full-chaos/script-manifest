import { createTransport, type Transporter } from "nodemailer";
import { renderTemplate } from "./templates.js";
import type { EmailService, SendEmailOptions } from "./types.js";

export type SmtpEmailServiceOptions = {
  host: string;
  port: number;
  secure?: boolean;
  from?: string;
  auth?: { user: string; pass: string };
};

export class SmtpEmailService implements EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: SmtpEmailServiceOptions) {
    this.from = options.from ?? process.env.EMAIL_FROM ?? "noreply@scriptmanifest.com";
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure ?? false,
      ...(options.auth ? { auth: options.auth } : {}),
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const rendered = renderTemplate(options.template, options.data);

    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }
}
