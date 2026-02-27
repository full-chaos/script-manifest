import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/**
 * Initialize OpenTelemetry distributed tracing for a service.
 *
 * Call this BEFORE creating the Fastify server so that auto-instrumentation
 * can patch Node.js built-ins (http, https, dns, etc.) at startup.
 *
 * Traces are exported via OTLP/HTTP to Jaeger (or any compatible collector).
 * Point OTEL_EXPORTER_OTLP_ENDPOINT at your collector endpoint:
 *   - Local dev (Jaeger all-in-one):  http://localhost:4318/v1/traces
 *   - Docker Compose:                 http://jaeger:4318/v1/traces
 *
 * @param serviceName - The logical service name (e.g. "api-gateway", "identity-service").
 *                      Appears in Jaeger UI as the service label.
 * @returns The started NodeSDK instance. You can call sdk.shutdown() for graceful shutdown.
 *
 * @example
 * // In your service entry point (before buildServer()):
 * const sdk = setupTracing("identity-service");
 * process.once("SIGTERM", () => sdk.shutdown());
 */
export function setupTracing(serviceName: string): NodeSDK {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        "http://localhost:4318/v1/traces",
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  return sdk;
}
