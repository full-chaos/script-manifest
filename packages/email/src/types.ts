export type EmailTemplate = "verification-code" | "password-reset" | "welcome" | "account-lockout";

export type SendEmailOptions = {
  to: string;
  template: EmailTemplate;
  data: Record<string, string>;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type SentEmail = {
  to: string;
  subject: string;
  template: EmailTemplate;
  data: Record<string, string>;
  sentAt: Date;
};

export interface EmailService {
  sendEmail(options: SendEmailOptions): Promise<void>;
}
