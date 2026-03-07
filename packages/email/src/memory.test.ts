import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryEmailService } from "./memory.js";

describe("MemoryEmailService", () => {
  let service: MemoryEmailService;

  beforeEach(() => {
    service = new MemoryEmailService();
  });

  it("starts with no sent emails", () => {
    assert.equal(service.sentEmails.length, 0);
  });

  it("stores sent emails", async () => {
    await service.sendEmail({
      to: "alice@example.com",
      template: "verification-code",
      data: { code: "123456", displayName: "Alice" },
    });

    assert.equal(service.sentEmails.length, 1);
    assert.equal(service.sentEmails[0]!.to, "alice@example.com");
    assert.equal(service.sentEmails[0]!.template, "verification-code");
    assert.ok(service.sentEmails[0]!.subject.includes("123456"));
    assert.ok(service.sentEmails[0]!.sentAt instanceof Date);
  });

  it("getLastEmailTo returns the most recent email to an address", async () => {
    await service.sendEmail({
      to: "bob@example.com",
      template: "verification-code",
      data: { code: "111111", displayName: "Bob" },
    });
    await service.sendEmail({
      to: "bob@example.com",
      template: "welcome",
      data: { displayName: "Bob" },
    });

    const last = service.getLastEmailTo("bob@example.com");
    assert.ok(last);
    assert.equal(last.template, "welcome");
  });

  it("getLastEmailTo returns undefined for unknown address", () => {
    assert.equal(service.getLastEmailTo("unknown@example.com"), undefined);
  });

  it("getEmailsTo returns all emails to an address", async () => {
    await service.sendEmail({ to: "a@test.com", template: "welcome", data: { displayName: "A" } });
    await service.sendEmail({ to: "b@test.com", template: "welcome", data: { displayName: "B" } });
    await service.sendEmail({ to: "a@test.com", template: "password-reset", data: { resetUrl: "x", displayName: "A" } });

    assert.equal(service.getEmailsTo("a@test.com").length, 2);
    assert.equal(service.getEmailsTo("b@test.com").length, 1);
  });

  it("clear removes all sent emails", async () => {
    await service.sendEmail({ to: "x@test.com", template: "welcome", data: { displayName: "X" } });
    assert.equal(service.sentEmails.length, 1);

    service.clear();
    assert.equal(service.sentEmails.length, 0);
  });
});
