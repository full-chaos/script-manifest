import assert from "node:assert/strict";
import test from "node:test";
import { createEmailService } from "./factory.js";
import { ResendEmailService } from "./resend.js";
import { SmtpEmailService } from "./smtp.js";

const ORIGINAL_ENV = {
  EMAIL_API_KEY: process.env.EMAIL_API_KEY,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE
};

test.afterEach(() => {
  process.env.EMAIL_API_KEY = ORIGINAL_ENV.EMAIL_API_KEY;
  process.env.SMTP_HOST = ORIGINAL_ENV.SMTP_HOST;
  process.env.SMTP_PORT = ORIGINAL_ENV.SMTP_PORT;
  process.env.SMTP_SECURE = ORIGINAL_ENV.SMTP_SECURE;
});

test("returns ResendEmailService when EMAIL_API_KEY is set", async () => {
  process.env.EMAIL_API_KEY = "re_test";
  process.env.SMTP_HOST = "smtp.local";

  const service = await createEmailService();
  assert.ok(service instanceof ResendEmailService);
});

test("returns SmtpEmailService when SMTP_HOST is set and no api key", async () => {
  delete process.env.EMAIL_API_KEY;
  process.env.SMTP_HOST = "smtp.local";
  process.env.SMTP_PORT = "2525";
  process.env.SMTP_SECURE = "true";

  const service = await createEmailService();
  assert.ok(service instanceof SmtpEmailService);
});

test("returns undefined when neither provider config is set", async () => {
  delete process.env.EMAIL_API_KEY;
  delete process.env.SMTP_HOST;

  const service = await createEmailService();
  assert.equal(service, undefined);
});
