export { validateRequiredEnv, warnMissingEnv } from "./env.js";
export { registerMetrics } from "./metrics.js";
export { bootstrapService, type BootLogger } from "./boot.js";
export { setupErrorReporting } from "./errorReporting.js";
// setupTracing isolated to ./tracing subpath to prevent OTel auto-instrumentation from loading on every import
