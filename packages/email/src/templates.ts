import type { EmailTemplate, RenderedEmail } from "./types.js";
import { renderVerificationCode } from "./templates/verification-code.js";
import { renderPasswordReset } from "./templates/password-reset.js";
import { renderWelcome } from "./templates/welcome.js";

export function renderTemplate(template: EmailTemplate, data: Record<string, string>): RenderedEmail {
  switch (template) {
    case "verification-code":
      return renderVerificationCode(data);
    case "password-reset":
      return renderPasswordReset(data);
    case "welcome":
      return renderWelcome(data);
  }
}
