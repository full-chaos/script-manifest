import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("setupTracing", () => {
  it("returns undefined when OTEL_EXPORTER_OTLP_ENDPOINT is not set", async () => {
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    const { setupTracing } = await import("../src/tracing.js");
    const sdk = setupTracing("test-service");
    assert.strictEqual(sdk, undefined);
  });

  it("returns a NodeSDK instance when OTEL_EXPORTER_OTLP_ENDPOINT is set", async () => {
    const { setupTracing } = await import("../src/tracing.js");
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4318/v1/traces";
    process.env["OTEL_SDK_DISABLED"] = "true";
    const sdk = setupTracing("test-service");
    assert.ok(sdk instanceof NodeSDK, "setupTracing should return a NodeSDK");
    await sdk?.shutdown().catch(() => {});
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    delete process.env["OTEL_SDK_DISABLED"];
  });

  it("accepts a custom endpoint without throwing", async () => {
    const { setupTracing } = await import("../src/tracing.js");
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://custom-collector:4318/v1/traces";
    process.env["OTEL_SDK_DISABLED"] = "true";
    let sdk: ReturnType<typeof setupTracing>;
    assert.doesNotThrow(() => {
      sdk = setupTracing("env-test-service");
    });
    await sdk!?.shutdown().catch(() => {});
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    delete process.env["OTEL_SDK_DISABLED"];
  });
});
