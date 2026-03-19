// OTEL preload module — must run via `--import` BEFORE the service entry point
// so auto-instrumentation patches http/dns/pg/etc. before they are imported.
//
// Usage:
//   "dev":   "tsx watch --import @script-manifest/service-utils/instrument src/index.ts"
//   "start": "node --import @script-manifest/service-utils/instrument dist/index.js"
//
// Requires OTEL_SERVICE_NAME and OTEL_EXPORTER_OTLP_ENDPOINT env vars.
// No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
import { setupTracing } from "./tracing.js";

const serviceName = process.env.OTEL_SERVICE_NAME ?? "unknown-service";
const sdk = setupTracing(serviceName);

if (sdk) {
  const shutdown = () => {
    sdk.shutdown().catch((err: unknown) => {
      process.stderr.write(`OTel SDK shutdown error: ${String(err)}\n`);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
