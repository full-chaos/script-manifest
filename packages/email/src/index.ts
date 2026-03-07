export type {
  EmailService,
  EmailTemplate,
  SendEmailOptions,
  RenderedEmail,
  SentEmail,
} from "./types.js";

export { renderTemplate } from "./templates.js";
export { MemoryEmailService } from "./memory.js";
export { ResendEmailService } from "./resend.js";
export { SmtpEmailService, type SmtpEmailServiceOptions } from "./smtp.js";
export { createEmailService } from "./factory.js";
