import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { setupErrorReporting, registerSentryErrorHandler } from "../src/errorReporting.js";

describe("setupErrorReporting", () => {
  let originalDsn: string | undefined;

  beforeEach(() => { originalDsn = process.env.SENTRY_DSN; });
  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
  });

  it("does not throw when SENTRY_DSN is not set", () => {
    delete process.env.SENTRY_DSN;
    assert.doesNotThrow(() => setupErrorReporting("test-service"));
  });

  it("does not throw when SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://key@sentry.example.com/1";
    assert.doesNotThrow(() => setupErrorReporting("test-service"));
  });
});

describe("registerSentryErrorHandler", () => {
  let originalDsn: string | undefined;

  beforeEach(() => { originalDsn = process.env.SENTRY_DSN; });
  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
  });

  it("registers error handler and returns 500 even when SENTRY_DSN is not set", async () => {
    delete process.env.SENTRY_DSN;
    const server = Fastify({ logger: false });
    registerSentryErrorHandler(server);
    server.get("/error", async () => { throw new Error("boom"); });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/error" });
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "Internal Server Error");
    await server.close();
  });

  it("returns 500 with generic message for server errors when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://key@sentry.example.com/1";
    setupErrorReporting("test-svc");
    const server = Fastify({ logger: false });
    registerSentryErrorHandler(server);
    server.get("/error", async () => { throw new Error("secret internal details"); });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/error" });
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "Internal Server Error");
    assert.ok(!res.body.includes("secret internal details"));
    await server.close();
  });

  it("passes through 4xx errors with their original message when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://key@sentry.example.com/1";
    setupErrorReporting("test-svc");
    const server = Fastify({ logger: false });
    registerSentryErrorHandler(server);
    server.get("/bad-request", async (_req, reply) => {
      const err = new Error("Validation failed") as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    });
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/bad-request" });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, "Validation failed");
    await server.close();
  });
});
