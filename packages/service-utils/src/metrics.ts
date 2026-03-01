import type { FastifyInstance } from "fastify";

/**
 * Register Prometheus metrics on a Fastify server.
 *
 * Exposes a `/metrics` endpoint that returns Prometheus-formatted text.
 * Includes default Node.js process metrics (memory, CPU, event loop lag)
 * plus per-route HTTP request duration histograms and summaries.
 *
 * Uses `clearRegisterOnInit: true` so that multiple Fastify server instances
 * created in the same process (e.g. during tests) each get a clean slate without
 * "metric already registered" errors on prom-client's global registry.
 *
 * @example
 * // In your buildServer():
 * const server = Fastify({ ... });
 * await registerMetrics(server);
 *
 * // To add to another service, call registerMetrics(server) in its buildServer().
 * // Metrics will be available at GET /metrics on each service's port.
 *
 * @param server - Fastify server instance to instrument.
 */
export async function registerMetrics(server: FastifyInstance): Promise<void> {
  // fastify-metrics is a CommonJS module; use createRequire for ESM compatibility.
  // When tsx or other transpilers inline this code into the consuming service,
  // import.meta.url points to the consumer — not to service-utils.  Resolve
  // from the service-utils package path so pnpm's strict node_modules works.
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  // Try import.meta.url first (works in compiled builds), fall back to
  // resolving from the service-utils package directory (works under tsx).
  let metricsPlugin: { default: Parameters<FastifyInstance["register"]>[0] };
  try {
    const req = createRequire(import.meta.url);
    metricsPlugin = req("fastify-metrics") as typeof metricsPlugin;
  } catch {
    // import.meta.url resolved to the consuming service — walk up to find
    // service-utils's own node_modules.
    const serviceUtilsPkg = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",  // from src/ up to package root
    );
    const req = createRequire(join(serviceUtilsPkg, "index.js"));
    metricsPlugin = req("fastify-metrics") as typeof metricsPlugin;
  }

  await server.register(metricsPlugin.default, {
    endpoint: "/metrics",
    defaultMetrics: { enabled: true },
    routeMetrics: { enabled: true },
    // Clear the global prom-client registry before registering default metrics.
    // This prevents "metric already registered" errors when multiple server
    // instances are created in the same process (e.g. during tests).
    clearRegisterOnInit: true,
  });
}
