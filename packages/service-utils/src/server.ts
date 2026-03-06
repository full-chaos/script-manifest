import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { randomUUID } from "node:crypto";

export type CreateServerOptions = {
  logger?: boolean | { level?: string };
  fastifyOptions?: Partial<FastifyServerOptions>;
};

export function createFastifyServer(options: CreateServerOptions = {}): FastifyInstance {
  return Fastify({
    logger: options.logger === false ? false : {
      level:
        (typeof options.logger === "object" ? options.logger.level : undefined) ??
        process.env.LOG_LEVEL ??
        "info",
    },
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    requestIdHeader: "x-request-id",
    ...options.fastifyOptions,
  });
}
