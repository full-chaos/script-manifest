import assert from "node:assert/strict";
import test from "node:test";
import * as index from "./index.js";
import { renderTemplate } from "./templates.js";
import { MemoryEmailService } from "./memory.js";
import { ResendEmailService } from "./resend.js";
import { SmtpEmailService } from "./smtp.js";
import { createEmailService } from "./factory.js";

test("index re-exports main email package APIs", () => {
  assert.equal(index.renderTemplate, renderTemplate);
  assert.equal(index.MemoryEmailService, MemoryEmailService);
  assert.equal(index.ResendEmailService, ResendEmailService);
  assert.equal(index.SmtpEmailService, SmtpEmailService);
  assert.equal(index.createEmailService, createEmailService);
});
