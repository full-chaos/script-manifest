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
