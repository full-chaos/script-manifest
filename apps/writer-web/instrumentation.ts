export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-grpc");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-grpc");
    const { PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics");
    const { resourceFromAttributes } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
    const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) return;

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "writer-web" }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: endpoint }),
      }),
      instrumentations: [getNodeAutoInstrumentations()]
    });
    sdk.start();
  }
}
