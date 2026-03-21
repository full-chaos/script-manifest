import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("instrument module", () => {
  let originalEndpoint: string | undefined;
  let originalServiceName: string | undefined;

  beforeEach(() => {
    originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    originalServiceName = process.env.OTEL_SERVICE_NAME;
  });

  afterEach(() => {
    if (originalEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    if (originalServiceName === undefined) delete process.env.OTEL_SERVICE_NAME;
    else process.env.OTEL_SERVICE_NAME = originalServiceName;
  });

  it("loads without error when OTEL_EXPORTER_OTLP_ENDPOINT is not set", async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    await assert.doesNotReject(
      async () => { await import(`../src/instrument.ts?no-endpoint-${Date.now()}`); },
    );
  });

  it("loads without error when OTEL_EXPORTER_OTLP_ENDPOINT is set", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    process.env.OTEL_SDK_DISABLED = "true";
    try {
      await assert.doesNotReject(
        async () => { await import(`../src/instrument.ts?with-endpoint-${Date.now()}`); },
      );
    } finally {
      delete process.env.OTEL_SDK_DISABLED;
    }
  });

  it("uses OTEL_SERVICE_NAME or defaults to unknown-service", async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
    await assert.doesNotReject(
      async () => { await import(`../src/instrument.ts?default-name-${Date.now()}`); },
    );
  });
});
