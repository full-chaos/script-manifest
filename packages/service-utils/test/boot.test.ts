import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("bootstrapService", () => {
  const urlEnvKeys: string[] = [];

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("BOOT_TEST_") && key.endsWith("_URL")) {
        urlEnvKeys.push(key);
      }
    }
  });

  afterEach(() => {
    for (const key of urlEnvKeys) {
      delete process.env[key];
    }
    urlEnvKeys.length = 0;
  });

  it("returns a BootLogger with phase and ready methods", async () => {
    const { bootstrapService } = await import(`../src/boot.ts?boot-shape-${Date.now()}`);
    const logger = bootstrapService("test-svc");
    assert.equal(typeof logger.phase, "function");
    assert.equal(typeof logger.ready, "function");
  });

  it("phase and ready do not throw", async () => {
    const { bootstrapService } = await import(`../src/boot.ts?boot-nothrow-${Date.now()}`);
    const logger = bootstrapService("test-svc");
    assert.doesNotThrow(() => logger.phase("env validated"));
    assert.doesNotThrow(() => logger.ready(4000));
  });

  it("throws when a _URL env var contains an invalid URL", async () => {
    process.env["BOOT_TEST_DATABASE_URL"] = "not-a-valid-url";
    urlEnvKeys.push("BOOT_TEST_DATABASE_URL");

    const { bootstrapService } = await import(`../src/boot.ts?boot-bad-url-${Date.now()}`);
    assert.throws(
      () => bootstrapService("test-svc"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("BOOT_TEST_DATABASE_URL"));
        assert.ok(err.message.includes("Invalid URL"));
        return true;
      },
    );
  });

  it("does not throw when _URL env vars are valid", async () => {
    process.env["BOOT_TEST_API_URL"] = "http://localhost:4000";
    urlEnvKeys.push("BOOT_TEST_API_URL");

    const { bootstrapService } = await import(`../src/boot.ts?boot-good-url-${Date.now()}`);
    assert.doesNotThrow(() => bootstrapService("test-svc"));
  });

  it("does not throw when _URL env var is empty (skipped)", async () => {
    process.env["BOOT_TEST_EMPTY_URL"] = "";
    urlEnvKeys.push("BOOT_TEST_EMPTY_URL");

    const { bootstrapService } = await import(`../src/boot.ts?boot-empty-url-${Date.now()}`);
    assert.doesNotThrow(() => bootstrapService("test-svc"));
  });
});
