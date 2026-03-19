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
 * Call this BEFORE creating the Fastify server so that auto-instrumentation
 * can patch Node.js built-ins (http, https, dns, etc.) at startup.
 *
 * Traces and metrics are exported via OTLP/gRPC to SigNoz (or any
 * compatible collector). Point OTEL_EXPORTER_OTLP_ENDPOINT at your
 * collector's gRPC endpoint (no path suffix — the SDK handles routing):
 *   - Local dev (SigNoz agent):       http://localhost:4317
 *   - Docker Compose:                 http://signoz-collection-agent:4317
 *
 * @param serviceName - The logical service name (e.g. "api-gateway", "identity-service").
 *                      Appears in the SigNoz UI as the service label.
 * @returns The started NodeSDK instance. You can call sdk.shutdown() for graceful shutdown.
 *
 * @example
 * // In your service entry point (before buildServer()):
 * const sdk = setupTracing("identity-service");
 * process.once("SIGTERM", () => sdk.shutdown());
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
