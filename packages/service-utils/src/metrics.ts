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
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const metricsPlugin = require("fastify-metrics") as {
    default: Parameters<FastifyInstance["register"]>[0];
  };

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
