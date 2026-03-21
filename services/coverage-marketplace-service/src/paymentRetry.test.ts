import assert from "node:assert/strict";
import test from "node:test";
import { PAYMENT_RETRY_BACKOFF_MS, getInitialRetryAt, getNextRetryAt } from "./paymentRetry.js";

test("getInitialRetryAt uses first backoff interval", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const retryAt = getInitialRetryAt(now);
  assert.equal(retryAt, new Date(now + PAYMENT_RETRY_BACKOFF_MS[0]).toISOString());
});

test("getNextRetryAt returns next interval based on attempt number", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const retryAt = getNextRetryAt(1, now);
  assert.equal(retryAt, new Date(now + PAYMENT_RETRY_BACKOFF_MS[2]).toISOString());
});

test("getNextRetryAt returns null when max retries exceeded", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const retryAt = getNextRetryAt(PAYMENT_RETRY_BACKOFF_MS.length - 1, now);
  assert.equal(retryAt, null);
});
