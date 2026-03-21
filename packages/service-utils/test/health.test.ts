import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerHealthRoutes } from "../src/health.js";

describe("registerHealthRoutes", () => {
  it("registers /health/live that returns { ok: true }", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, { serviceName: "test-svc" });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health/live" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    await server.close();
  });

  it("registers /health that returns 200 with service name when no check", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, { serviceName: "my-service" });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.service, "my-service");
    assert.equal(body.ok, true);
    await server.close();
  });

  it("registers /health/ready that returns 200 with service name when no check", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, { serviceName: "ready-svc" });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health/ready" });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.service, "ready-svc");
    assert.equal(body.ok, true);
    await server.close();
  });

  it("returns 200 when onHealthCheck passes", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, {
      serviceName: "healthy-svc",
      onHealthCheck: async () => ({ db: true, redis: true }),
    });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.deepEqual(body.checks, { db: true, redis: true });
    await server.close();
  });

  it("returns 503 when onHealthCheck reports a failure", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, {
      serviceName: "unhealthy-svc",
      onHealthCheck: async () => ({ db: true, redis: false }),
    });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.deepEqual(body.checks, { db: true, redis: false });
    await server.close();
  });

  it("returns 503 when onHealthCheck throws", async () => {
    const server = Fastify({ logger: false });
    registerHealthRoutes(server, {
      serviceName: "crash-svc",
      onHealthCheck: async () => { throw new Error("db connection failed"); },
    });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, false);
    assert.deepEqual(body.checks, { unknown: false });
    await server.close();
  });

  it("/health and /health/ready share the same deep check behavior", async () => {
    const server = Fastify({ logger: false });
    let callCount = 0;
    registerHealthRoutes(server, {
      serviceName: "shared-check",
      onHealthCheck: async () => { callCount++; return { ok: true }; },
    });
    await server.ready();

    await server.inject({ method: "GET", url: "/health" });
    await server.inject({ method: "GET", url: "/health/ready" });
    assert.equal(callCount, 2);
    await server.close();
  });
});
