import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

/**
 * prom-client uses a global default registry per process.
 * Registering default metrics twice in the same process throws.
 * We run a single server instance and validate both assertions in one test.
 */
describe("registerMetrics", () => {
  it("registers a /metrics endpoint with Prometheus-formatted text including default process metrics", async () => {
    const { registerMetrics } = await import("../src/metrics.js");
    const server = Fastify({ logger: false });
    await registerMetrics(server);
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/metrics",
    });

    // HTTP status check
    assert.equal(response.statusCode, 200, "should return HTTP 200");

    // Content-type check
    const contentType = response.headers["content-type"] ?? "";
    assert.ok(
      contentType.includes("text/plain"),
      `content-type should include text/plain, got: ${contentType}`
    );

    const body = response.body;

    // Prometheus text format structure check
    assert.ok(
      body.includes("# HELP") || body.includes("# TYPE"),
      "response body should contain Prometheus HELP or TYPE comments"
    );

    // Default process metrics check
    // prom-client registers several default metrics; at least one of these will be present.
    const hasDefaultMetrics =
      body.includes("process_cpu_seconds_total") ||
      body.includes("process_cpu_user_seconds_total") ||
      body.includes("nodejs_version_info") ||
      body.includes("process_start_time_seconds");

    assert.ok(
      hasDefaultMetrics,
      "response should contain default Node.js process metrics"
    );

    await server.close();
  });
});
