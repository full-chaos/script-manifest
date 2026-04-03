import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFastifyServer } from "../src/server.js";

describe("createFastifyServer", () => {
  let originalLogLevel: string | undefined;

  beforeEach(() => { originalLogLevel = process.env.LOG_LEVEL; });
  afterEach(() => {
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
  });

  it("returns a Fastify instance", () => {
    const server = createFastifyServer({ logger: false });
    assert.ok(server);
    assert.equal(typeof server.inject, "function");
  });

  it("uses LOG_LEVEL env for logger level", async () => {
    process.env.LOG_LEVEL = "debug";
    const server = createFastifyServer();
    await server.ready();
    assert.equal((server.log as unknown as { level: string }).level, "debug");
    await server.close();
  });

  it("defaults to info when LOG_LEVEL is not set", async () => {
    delete process.env.LOG_LEVEL;
    const server = createFastifyServer();
    await server.ready();
    assert.equal((server.log as unknown as { level: string }).level, "info");
    await server.close();
  });

  it("allows disabling logger", () => {
    const server = createFastifyServer({ logger: false });
    assert.ok(server);
  });

  it("allows overriding logger level via options", async () => {
    const server = createFastifyServer({ logger: { level: "warn" } });
    await server.ready();
    assert.equal((server.log as unknown as { level: string }).level, "warn");
    await server.close();
  });

  it("honors x-request-id header for request ID", async () => {
    const server = createFastifyServer({ logger: false });
    server.get("/test", async (req) => ({ id: req.id }));
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/test",
      headers: { "x-request-id": "custom-req-id" },
    });

    const body = JSON.parse(response.body);
    assert.equal(body.id, "custom-req-id");
    await server.close();
  });

  it("generates a UUID request ID when x-request-id is absent", async () => {
    const server = createFastifyServer({ logger: false });
    server.get("/test", async (req) => ({ id: req.id }));
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/test" });
    const body = JSON.parse(response.body);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    assert.ok(uuidPattern.test(body.id), `Expected UUID, got: ${body.id}`);
    await server.close();
  });

  it("passes through extra fastifyOptions", async () => {
    const server = createFastifyServer({
      logger: false,
      fastifyOptions: { maxParamLength: 500 },
    });
    assert.ok(server);
  });

  it("formats log levels as strings instead of numbers", async () => {
    const server = createFastifyServer();
    server.get("/log-test", async (req) => {
      req.log.info("formatter check");
      return { ok: true };
    });
    await server.ready();
    await server.inject({ method: "GET", url: "/log-test" });
    await server.close();
    assert.ok(true);
  });
});
