import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { validateRequiredEnv, warnMissingEnv } from "../src/env.js";

// ── validateRequiredEnv ─────────────────────────────────────────────────────

describe("validateRequiredEnv", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    // Clean up any test vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("TEST_") || key.startsWith("WARN_TEST_") || key.startsWith("WARN_PROD_")) {
        delete process.env[key];
      }
    }
  });

  describe("in non-production environments", () => {
    it("does nothing when NODE_ENV is undefined", () => {
      delete process.env.NODE_ENV;
      assert.doesNotThrow(() => validateRequiredEnv(["DEFINITELY_NOT_SET_VAR_12345"]));
    });

    it("does nothing when NODE_ENV is 'development'", () => {
      process.env.NODE_ENV = "development";
      assert.doesNotThrow(() => validateRequiredEnv(["DEFINITELY_NOT_SET_VAR_12345"]));
    });

    it("does nothing when NODE_ENV is 'test'", () => {
      process.env.NODE_ENV = "test";
      assert.doesNotThrow(() => validateRequiredEnv(["DEFINITELY_NOT_SET_VAR_12345"]));
    });

    it("does nothing with an empty vars list in development", () => {
      process.env.NODE_ENV = "development";
      assert.doesNotThrow(() => validateRequiredEnv([]));
    });
  });

  describe("in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("does not throw when all vars are set", () => {
      process.env["TEST_REQUIRED_VAR_A"] = "value-a";
      process.env["TEST_REQUIRED_VAR_B"] = "value-b";
      assert.doesNotThrow(() => validateRequiredEnv(["TEST_REQUIRED_VAR_A", "TEST_REQUIRED_VAR_B"]));
    });

    it("does not throw with an empty vars list", () => {
      assert.doesNotThrow(() => validateRequiredEnv([]));
    });

    it("throws when a single var is missing", () => {
      delete process.env["TEST_MISSING_VAR_SINGLE"];
      assert.throws(
        () => validateRequiredEnv(["TEST_MISSING_VAR_SINGLE"]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("TEST_MISSING_VAR_SINGLE"),
            `Expected message to contain var name, got: ${err.message}`
          );
          assert.ok(
            err.message.startsWith("Missing required env vars:"),
            `Expected standard prefix, got: ${err.message}`
          );
          return true;
        }
      );
    });

    it("throws and names all missing vars when multiple are absent", () => {
      delete process.env["TEST_MISSING_VAR_X"];
      delete process.env["TEST_MISSING_VAR_Y"];
      assert.throws(
        () => validateRequiredEnv(["TEST_MISSING_VAR_X", "TEST_MISSING_VAR_Y"]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("TEST_MISSING_VAR_X"), "Should include first missing var");
          assert.ok(err.message.includes("TEST_MISSING_VAR_Y"), "Should include second missing var");
          return true;
        }
      );
    });

    it("only throws for missing vars, not for ones that are set", () => {
      process.env["TEST_SET_VAR"] = "set";
      delete process.env["TEST_UNSET_VAR"];
      assert.throws(
        () => validateRequiredEnv(["TEST_SET_VAR", "TEST_UNSET_VAR"]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!err.message.includes("TEST_SET_VAR"), "Should not mention set var");
          assert.ok(err.message.includes("TEST_UNSET_VAR"), "Should mention unset var");
          return true;
        }
      );
    });

    it("treats an empty string value as missing", () => {
      process.env["TEST_EMPTY_VAR"] = "";
      assert.throws(
        () => validateRequiredEnv(["TEST_EMPTY_VAR"]),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("TEST_EMPTY_VAR"));
          return true;
        }
      );
    });
  });
});

// ── warnMissingEnv ──────────────────────────────────────────────────────────

describe("warnMissingEnv", () => {
  let warnMessages: string[] = [];
  const originalWarn = console.warn;

  beforeEach(() => {
    warnMessages = [];
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.join(" "));
    };
    // Clean up any test vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("WARN_TEST_") || key.startsWith("WARN_PROD_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    console.warn = originalWarn;
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("WARN_TEST_") || key.startsWith("WARN_PROD_")) {
        delete process.env[key];
      }
    }
  });

  it("does not warn when all vars are set", () => {
    process.env["WARN_TEST_VAR_SET"] = "hello";
    warnMissingEnv(["WARN_TEST_VAR_SET"]);
    assert.equal(warnMessages.length, 0);
  });

  it("warns when a var is missing", () => {
    warnMissingEnv(["WARN_TEST_VAR_MISSING"]);
    assert.equal(warnMessages.length, 1);
    assert.ok(warnMessages[0].includes("WARN_TEST_VAR_MISSING"));
  });

  it("includes the service name prefix when provided", () => {
    warnMissingEnv(["WARN_TEST_VAR_WITH_NAME"], "my-service");
    assert.equal(warnMessages.length, 1);
    assert.ok(warnMessages[0].startsWith("[my-service]"), `Expected [my-service] prefix, got: ${warnMessages[0]}`);
    assert.ok(warnMessages[0].includes("WARN_TEST_VAR_WITH_NAME"));
  });

  it("does not include a prefix when service name is omitted", () => {
    warnMissingEnv(["WARN_TEST_VAR_NO_NAME"]);
    assert.equal(warnMessages.length, 1);
    assert.ok(!warnMessages[0].startsWith("["), "Should not have a bracket prefix");
  });

  it("does not throw even in production when vars are missing", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.doesNotThrow(() => warnMissingEnv(["WARN_PROD_TEST_VAR"]));
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it("does nothing with an empty vars list", () => {
    warnMissingEnv([]);
    assert.equal(warnMessages.length, 0);
  });
});
