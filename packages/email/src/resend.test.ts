import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { ResendEmailService } from "./resend.js";

function createServiceWithFakeClient() {
  const sendCalls: Array<{ from: string; to: string; subject: string; html: string; text: string }> = [];
  let nextError: { name: string; message: string } | null = null;

  const service = new ResendEmailService({ apiKey: "re_test", from: "noreply@test.com" });

  Object.defineProperty(service, "client", {
    value: {
      emails: {
        send: async (payload: { from: string; to: string; subject: string; html: string; text: string }) => {
          sendCalls.push(payload);
          return { error: nextError };
        },
      },
    },
    writable: true,
  });

  return {
    service,
    sendCalls,
    setNextError(err: { name: string; message: string } | null) { nextError = err; },
  };
}

test("sendEmail renders template and sends through Resend client", async () => {
  const { service, sendCalls } = createServiceWithFakeClient();
  await service.sendEmail({
    to: "user@example.com",
    template: "verification-code",
    data: { code: "123456", displayName: "User" },
  });

  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0]?.from, "noreply@test.com");
  assert.equal(sendCalls[0]?.to, "user@example.com");
  assert.ok(sendCalls[0]?.subject.includes("123456"));
});

test("sendEmail surfaces Resend API errors", async () => {
  const { service, setNextError } = createServiceWithFakeClient();
  setNextError({ name: "validation_error", message: "invalid recipient" });

  await assert.rejects(
    () =>
      service.sendEmail({
        to: "bad-email",
        template: "welcome",
        data: { displayName: "User" },
      }),
    /Resend API error \[validation_error\]: invalid recipient/,
  );
});

test("enforces per-recipient rate limit and supports pruning expired entries", () => {
  let now = 1_000;
  const dateNowMock = mock.method(Date, "now", () => now);
  const service = new ResendEmailService({ apiKey: "re_test" });

  const checker = service as unknown as { checkRateLimit: (to: string) => void };

  for (let i = 0; i < 10; i += 1) {
    assert.doesNotThrow(() => checker.checkRateLimit("writer@example.com"));
  }

  assert.throws(() => checker.checkRateLimit("writer@example.com"), /Rate limit exceeded/);

  now += 61 * 60 * 1000;
  service.pruneExpiredEntries();
  assert.doesNotThrow(() => checker.checkRateLimit("writer@example.com"));

  dateNowMock.mock.restore();
});
