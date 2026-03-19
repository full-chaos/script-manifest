import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Initialize OpenTelemetry distributed tracing and metrics for a service.
 *
 * Called by the `--import` preload module (`instrument.ts`) which runs
 * before any application code, ensuring auto-instrumentation patches
 * Node.js built-ins (http, dns, pg, etc.) before they are imported.
 *
 * Do NOT call this directly from service entry points — use `--import`:
 *   "dev":   "tsx watch --import @script-manifest/service-utils/instrument src/index.ts"
 *   "start": "node --import @script-manifest/service-utils/instrument dist/index.js"
 *
 * No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
 */
export function setupTracing(serviceName: string): NodeSDK | undefined {
  // Only enable telemetry when an OTLP endpoint is explicitly configured.
  // This prevents services from hanging or crashing when no collector is available
  // (e.g. in CI integration tests or local dev without SigNoz).
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return undefined;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: endpoint,
      }),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  return sdk;
}
