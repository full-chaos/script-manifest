import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { SmtpEmailService } from "./smtp.js";

describe("SmtpEmailService", () => {
  it("sends email via SMTP transporter", async () => {
    const service = new SmtpEmailService({
      host: "localhost",
      port: 1025,
      from: "test@example.com",
    });

    // Stub the transporter.sendMail method
    const sendMail = mock.fn(async () => ({ messageId: "test-id" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).transporter.sendMail = sendMail;

    await service.sendEmail({
      to: "user@example.com",
      template: "verification-code",
      data: { code: "123456", displayName: "Test User" },
    });

    assert.equal(sendMail.mock.callCount(), 1);
    const call = sendMail.mock.calls[0]!.arguments[0] as Record<string, unknown>;
    assert.equal(call.from, "test@example.com");
    assert.equal(call.to, "user@example.com");
    assert.ok((call.subject as string).includes("123456"));
    assert.ok((call.html as string).includes("123456"));
    assert.ok((call.text as string).includes("123456"));
  });

  it("uses default from address from env", async () => {
    const service = new SmtpEmailService({ host: "localhost", port: 1025 });

    const sendMail = mock.fn(async () => ({ messageId: "test-id" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).transporter.sendMail = sendMail;

    await service.sendEmail({
      to: "user@example.com",
      template: "welcome",
      data: { displayName: "Writer" },
    });

    assert.equal(sendMail.mock.callCount(), 1);
    const call = sendMail.mock.calls[0]!.arguments[0] as Record<string, unknown>;
    assert.equal(call.from, "noreply@scriptmanifest.com");
  });
});
