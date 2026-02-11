import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

export function registerRequestId(server: FastifyInstance): void {
  server.addHook("onRequest", async (req, reply) => {
    const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
    req.headers["x-request-id"] = requestId;
    void reply.header("x-request-id", requestId);
  });
}
