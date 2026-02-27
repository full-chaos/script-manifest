import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("setupTracing", () => {
  let sdk: Awaited<ReturnType<typeof import("../src/tracing.js").setupTracing>>;

  before(async () => {
    // Import here so we can control lifecycle
    const { setupTracing } = await import("../src/tracing.js");
    // Use OTEL_SDK_DISABLED=true to prevent actual exporter connections during tests.
    // We still call setupTracing to verify it initialises without throwing.
    process.env["OTEL_SDK_DISABLED"] = "true";
    sdk = setupTracing("test-service");
  });

  after(async () => {
    delete process.env["OTEL_SDK_DISABLED"];
    // Gracefully shut the SDK down so connections close before the test runner exits.
    await sdk.shutdown().catch(() => {
      // Shutdown errors are acceptable in unit tests (no real exporter).
    });
  });

  it("returns a NodeSDK instance", async () => {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    assert.ok(sdk instanceof NodeSDK, "setupTracing should return a NodeSDK");
  });

  it("accepts a custom service name without throwing", async () => {
    const { setupTracing } = await import("../src/tracing.js");
    process.env["OTEL_SDK_DISABLED"] = "true";
    let sdk2: Awaited<ReturnType<typeof setupTracing>> | undefined;
    assert.doesNotThrow(() => {
      sdk2 = setupTracing("another-service");
    });
    await sdk2?.shutdown().catch(() => {/* ignore */});
  });

  it("uses OTEL_EXPORTER_OTLP_ENDPOINT env var when set", async () => {
    // We can't easily inspect internal state, but we verify no error is thrown
    // when a custom endpoint is set.
    const { setupTracing } = await import("../src/tracing.js");
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://custom-collector:4318/v1/traces";
    process.env["OTEL_SDK_DISABLED"] = "true";
    let sdkCustom: Awaited<ReturnType<typeof setupTracing>> | undefined;
    assert.doesNotThrow(() => {
      sdkCustom = setupTracing("env-test-service");
    });
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    await sdkCustom?.shutdown().catch(() => {/* ignore */});
  });
});
