import type { FastifyInstance } from "fastify";
import { WriterProfileSchema, WriterProfileUpdateRequestSchema } from "@script-manifest/contracts";
import { z } from "zod";
import {
  type GatewayContext,
  addAuthUserIdHeader,
  getUserIdFromAuth,
  proxyJsonRequest
} from "../helpers.js";
import { ApiErrorSchema, toOpenApiSchema } from "../openapi.js";

export function registerProfileRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.get("/api/v1/profiles/:writerId", {
    schema: {
      tags: ["profiles"],
      summary: "Get writer profile",
      params: toOpenApiSchema(z.object({ writerId: z.string().min(1) })),
      response: {
        200: toOpenApiSchema(WriterProfileSchema)
      }
    },
    handler: async (req, reply) => {
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
    }
  });

  server.put("/api/v1/profiles/:writerId", {
    schema: {
      tags: ["profiles"],
      summary: "Update writer profile",
      security: [{ bearerAuth: [] }],
      params: toOpenApiSchema(z.object({ writerId: z.string().min(1) })),
      body: toOpenApiSchema(WriterProfileUpdateRequestSchema),
      response: {
        200: toOpenApiSchema(WriterProfileSchema),
        400: toOpenApiSchema(ApiErrorSchema),
        403: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      const { writerId } = req.params as { writerId: string };
      const userId = await getUserIdFromAuth(ctx.requestFn, ctx.identityServiceBase, req.headers.authorization, req.log);

      // CHAOS-912: Enforce profile ownership — only the profile owner may update it.
      if (userId !== writerId) {
        return reply.status(403).send({ error: "forbidden" });
      }

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
    }
  });
}
