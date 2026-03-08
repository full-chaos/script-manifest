import type { FastifyInstance } from "fastify";
import {
  MfaDisableRequestSchema,
  MfaLoginVerifyRequestSchema,
  MfaSetupResponseSchema,
  MfaStatusResponseSchema,
  MfaVerifySetupRequestSchema,
  MfaVerifySetupResponseSchema
} from "@script-manifest/contracts";
import { z } from "zod";
import {
  type GatewayContext,
  copyAuthHeader,
  proxyJsonRequest
} from "../helpers.js";
import { ApiErrorSchema, toOpenApiSchema, UnauthorizedErrorSchema } from "../openapi.js";

const AUTH_RATE_MAX = Math.max(10, Math.ceil(Number(process.env.RATE_LIMIT_MAX ?? 100) * 0.1));

export function registerMfaRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  // ── Authenticated MFA management routes ───────────────────────────

  server.post("/api/v1/auth/mfa/setup", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth", "mfa"],
      summary: "Start MFA setup (generate TOTP secret)",
      security: [{ bearerAuth: [] }],
      response: {
        200: toOpenApiSchema(MfaSetupResponseSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema),
        409: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/mfa/setup`,
        {
          method: "POST",
          headers: copyAuthHeader(req.headers.authorization)
        }
      );
    }
  });

  server.post("/api/v1/auth/mfa/verify-setup", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth", "mfa"],
      summary: "Verify TOTP code to activate MFA",
      security: [{ bearerAuth: [] }],
      body: toOpenApiSchema(MfaVerifySetupRequestSchema),
      response: {
        200: toOpenApiSchema(MfaVerifySetupResponseSchema),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/mfa/verify-setup`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...copyAuthHeader(req.headers.authorization) },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post("/api/v1/auth/mfa/disable", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth", "mfa"],
      summary: "Disable MFA (requires password + TOTP code)",
      security: [{ bearerAuth: [] }],
      body: toOpenApiSchema(MfaDisableRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema),
        403: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/mfa/disable`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...copyAuthHeader(req.headers.authorization) },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get("/api/v1/auth/mfa/status", {
    schema: {
      tags: ["auth", "mfa"],
      summary: "Check MFA status for current user",
      security: [{ bearerAuth: [] }],
      response: {
        200: toOpenApiSchema(MfaStatusResponseSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/mfa/status`,
        {
          method: "GET",
          headers: copyAuthHeader(req.headers.authorization)
        }
      );
    }
  });

  // ── Public MFA verify route (login challenge) ─────────────────────

  server.post("/api/v1/auth/mfa/verify", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth", "mfa"],
      summary: "Verify MFA code during login challenge",
      body: toOpenApiSchema(MfaLoginVerifyRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ token: z.string(), user: z.object({}).passthrough() }).passthrough()),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/mfa/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });
}
