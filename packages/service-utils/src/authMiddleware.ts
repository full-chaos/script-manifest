import type { FastifyInstance } from "fastify";
import { verifyServiceToken, type ServiceTokenPayload } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    serviceUser?: ServiceTokenPayload;
  }
}

export function registerAuthVerification(server: FastifyInstance): void {
  const secret = process.env.SERVICE_TOKEN_SECRET;
  if (!secret) {
    server.log.warn("SERVICE_TOKEN_SECRET not set - service token verification disabled");
    return;
  }

  server.addHook("onRequest", async (request) => {
    const token = request.headers["x-service-token"] as string | undefined;
    if (!token) {
      return;
    }

    const payload = verifyServiceToken(token, secret);
    if (payload) {
      request.serviceUser = payload;
    }
  });
}
