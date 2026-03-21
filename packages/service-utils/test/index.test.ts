import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as serviceUtils from "../src/index.js";

describe("service-utils index re-exports", () => {
  const expectedExports = [
    "validateRequiredEnv",
    "validateUrlEnv",
    "warnMissingEnv",
    "registerMetrics",
    "bootstrapService",
    "setupErrorReporting",
    "registerSentryErrorHandler",
    "hasPermission",
    "hasRole",
    "ROLES",
    "PERMISSIONS",
    "signServiceToken",
    "verifyServiceToken",
    "registerAuthVerification",
    "publishNotificationEvent",
    "disconnectProducer",
    "isMainModule",
    "getAuthUserId",
    "readHeader",
    "readBearerToken",
    "createFastifyServer",
    "registerHealthRoutes",
    "BaseMemoryRepository",
    "getKafkaClient",
    "_resetKafkaClient",
    "makeServiceHeaders",
    "verifyInternalToken",
    "requireServiceToken",
    "requireAdminServiceToken",
    "resolveServiceSecret",
  ];

  for (const name of expectedExports) {
    it(`exports ${name}`, () => {
      assert.ok(
        name in serviceUtils,
        `Expected "${name}" to be exported from service-utils`,
      );
    });
  }

  it("does not export unexpected symbols (sanity check)", () => {
    const actual = Object.keys(serviceUtils).filter((k) => !k.startsWith("_"));
    const expected = expectedExports.filter((k) => !k.startsWith("_"));
    for (const key of actual) {
      assert.ok(expected.includes(key), `Unexpected export: ${key}`);
    }
  });
});
