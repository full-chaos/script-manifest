import assert from "node:assert/strict";
import test from "node:test";
import {
  AddIpBlockRequestSchema,
  IpBlockListRequestSchema,
  IpBlockEntrySchema
} from "../src/ip-blocking.js";

test("AddIpBlockRequestSchema accepts IPv4 and expiry", () => {
  const parsed = AddIpBlockRequestSchema.parse({
    ipAddress: "203.0.113.5",
    reason: "abuse",
    expiresInHours: 24
  });
  assert.equal(parsed.expiresInHours, 24);
});

test("AddIpBlockRequestSchema rejects overly long IP values", () => {
  const result = AddIpBlockRequestSchema.safeParse({
    ipAddress: "x".repeat(46),
    reason: "abuse"
  });
  assert.equal(result.success, false);
});

test("IpBlockListRequestSchema coerces pagination defaults", () => {
  const parsed = IpBlockListRequestSchema.parse({ page: "2", limit: "10", includeExpired: "true" });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.includeExpired, true);
});

test("IpBlockEntrySchema requires datetime createdAt", () => {
  const result = IpBlockEntrySchema.safeParse({
    id: "ip_1",
    ipAddress: "203.0.113.5",
    reason: "abuse",
    blockedBy: "admin_1",
    autoBlocked: false,
    expiresAt: null,
    createdAt: "not-a-date"
  });
  assert.equal(result.success, false);
});
