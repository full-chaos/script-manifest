import type { FastifyInstance } from "fastify";
import { WriterProfileUpdateRequestSchema } from "@script-manifest/contracts";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";

export function registerProfileRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/profiles/${encodeURIComponent(writerId)}`,
      {
        method: "GET",
        headers: addAuthUserIdHeader({}, userId)
      }
    );
  });

  server.put("/api/v1/profiles/:writerId", async (req, reply) => {
    const { writerId } = req.params as { writerId: string };
    const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);
    const parsed = WriterProfileUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsed.error.flatten()
      });
    }

    return proxyJsonRequest(
      reply,
      ctx.requestFn,
      `${ctx.profileServiceBase}/internal/profiles/${encodeURIComponent(writerId)}`,
      {
        method: "PUT",
        headers: addAuthUserIdHeader(
          { "content-type": "application/json" },
          userId
        ),
        body: JSON.stringify(parsed.data)
      }
    );
  });
}
