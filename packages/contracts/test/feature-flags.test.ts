import assert from "node:assert/strict";
import test from "node:test";
import {
  FeatureFlagSchema,
  CreateFeatureFlagRequestSchema,
  UpdateFeatureFlagRequestSchema,
  ClientFlagsResponseSchema
} from "../src/feature-flags.js";

test("CreateFeatureFlagRequestSchema accepts valid key format", () => {
  const parsed = CreateFeatureFlagRequestSchema.parse({
    key: "coverage_marketplace",
    description: "Enable marketplace",
    enabled: true
  });
  assert.equal(parsed.enabled, true);
});

test("CreateFeatureFlagRequestSchema rejects invalid keys", () => {
  const result = CreateFeatureFlagRequestSchema.safeParse({ key: "1bad-key", description: "x" });
  assert.equal(result.success, false);
});

test("UpdateFeatureFlagRequestSchema validates rollout percentage", () => {
  const valid = UpdateFeatureFlagRequestSchema.safeParse({ rolloutPct: 25, userAllowlist: ["user_1"] });
  const invalid = UpdateFeatureFlagRequestSchema.safeParse({ rolloutPct: 101 });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("FeatureFlagSchema and ClientFlagsResponseSchema validate server/client shapes", () => {
  const flag = FeatureFlagSchema.parse({
    key: "coverage_marketplace",
    description: "desc",
    enabled: true,
    rolloutPct: 100,
    userAllowlist: [],
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
  const client = ClientFlagsResponseSchema.parse({ flags: { [flag.key]: flag.enabled } });
  assert.equal(client.flags.coverage_marketplace, true);
});
