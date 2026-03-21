import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerAuthVerification } from "../src/authMiddleware.js";
import { signServiceToken } from "../src/jwt.js";

const TEST_SECRET = "test-auth-middleware-secret";

describe("registerAuthVerification", () => {
  let originalSecret: string | undefined;

  beforeEach(() => { originalSecret = process.env.SERVICE_TOKEN_SECRET; });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SERVICE_TOKEN_SECRET;
    else process.env.SERVICE_TOKEN_SECRET = originalSecret;
  });

  it("decorates request.serviceUser with valid token payload", async () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const server = Fastify({ logger: false });
    registerAuthVerification(server);
    server.get("/test", async (req) => ({
      sub: req.serviceUser?.sub ?? null,
      role: req.serviceUser?.role ?? null,
    }));
    await server.ready();

    const token = signServiceToken({ sub: "user-99", role: "admin" }, TEST_SECRET);
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { "x-service-token": token },
    });

    const body = JSON.parse(res.body);
    assert.equal(body.sub, "user-99");
    assert.equal(body.role, "admin");
    await server.close();
  });

  it("leaves serviceUser undefined when no token header is sent", async () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const server = Fastify({ logger: false });
    registerAuthVerification(server);
    server.get("/test", async (req) => ({ hasUser: req.serviceUser !== undefined }));
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/test" });
    const body = JSON.parse(res.body);
    assert.equal(body.hasUser, false);
    await server.close();
  });

  it("leaves serviceUser undefined for an invalid token", async () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const server = Fastify({ logger: false });
    registerAuthVerification(server);
    server.get("/test", async (req) => ({ hasUser: req.serviceUser !== undefined }));
    await server.ready();

    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { "x-service-token": "invalid.token.here" },
    });

    const body = JSON.parse(res.body);
    assert.equal(body.hasUser, false);
    await server.close();
  });

  it("leaves serviceUser undefined for a token signed with wrong secret", async () => {
    process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
    const server = Fastify({ logger: false });
    registerAuthVerification(server);
    server.get("/test", async (req) => ({ hasUser: req.serviceUser !== undefined }));
    await server.ready();

    const badToken = signServiceToken({ sub: "u", role: "writer" }, "wrong-secret");
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { "x-service-token": badToken },
    });

    const body = JSON.parse(res.body);
    assert.equal(body.hasUser, false);
    await server.close();
  });

  it("skips hook registration when SERVICE_TOKEN_SECRET is not set", async () => {
    delete process.env.SERVICE_TOKEN_SECRET;
    const server = Fastify({ logger: false });
    registerAuthVerification(server);
    server.get("/test", async (req) => ({ hasUser: req.serviceUser !== undefined }));
    await server.ready();

    const token = signServiceToken({ sub: "u", role: "admin" }, TEST_SECRET);
    const res = await server.inject({
      method: "GET",
      url: "/test",
      headers: { "x-service-token": token },
    });

    const body = JSON.parse(res.body);
    assert.equal(body.hasUser, false);
    await server.close();
  });
});
