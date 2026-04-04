import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AuthLoginRequestSchema,
  AuthMeResponseSchema,
  AuthRegisterRequestSchema,
  AuthSessionResponseSchema,
  DeleteAccountRequestSchema,
  EmailVerificationRequestSchema,
  ForgotPasswordRequestSchema,
  ResendVerificationRequestSchema,
  ResetPasswordRequestSchema
} from "@script-manifest/contracts";
import { z } from "zod";
import {
  type GatewayContext,
  buildQuerySuffix,
  copyAuthHeader,
  proxyJsonRequest,
  safeJsonParse
} from "../helpers.js";
import { ApiErrorSchema, toOpenApiSchema, UnauthorizedErrorSchema } from "../openapi.js";
import { readBearerToken } from "@script-manifest/service-utils";

const GLOBAL_RATE_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);
const AUTH_RATE_MAX = Math.max(10, Math.ceil(GLOBAL_RATE_MAX * 0.1));
const REFRESH_RATE_MAX = Math.max(30, Math.ceil(GLOBAL_RATE_MAX * 0.3));

const SESSION_COOKIE_NAME = "session_token";
const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

function setAuthCookies(reply: FastifyReply, payload: z.infer<typeof AuthSessionResponseSchema>): void {
  const sessionExpiry = new Date(payload.expiresAt);
  if (!Number.isNaN(sessionExpiry.getTime())) {
    reply.setCookie(SESSION_COOKIE_NAME, payload.token, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
      expires: sessionExpiry
    });
  }

  if (payload.refreshToken) {
    reply.setCookie(REFRESH_COOKIE_NAME, payload.refreshToken, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + REFRESH_COOKIE_TTL_MS)
    });
  }
}

function clearAuthCookies(reply: FastifyReply): void {
  const options = {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax" as const,
    path: "/"
  };

  reply.clearCookie(SESSION_COOKIE_NAME, options);
  reply.clearCookie(REFRESH_COOKIE_NAME, options);
}

async function proxyAuthSessionRequest(
  ctx: GatewayContext,
  reply: FastifyReply,
  url: string,
  options: { method: string; headers: Record<string, string>; body: string }
) {
  try {
    const upstream = await ctx.requestFn(url, options);
    const rawBody = await upstream.body.text();
    const parsedBody = safeJsonParse(rawBody);
    const parsedSession = AuthSessionResponseSchema.safeParse(parsedBody);
    if (parsedSession.success) {
      setAuthCookies(reply, parsedSession.data);
    }

    const contentType = (upstream.headers as Record<string, string> | undefined)?.["content-type"];
    if (contentType) {
      void reply.header("content-type", contentType);
    }
    return reply.status(upstream.statusCode).send(rawBody || null);
  } catch (error) {
    return reply.status(502).send({
      error: "upstream_unavailable",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

export function registerAuthRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  server.post("/api/v1/auth/register", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Register user",
      body: toOpenApiSchema(AuthRegisterRequestSchema),
      response: {
        200: toOpenApiSchema(AuthSessionResponseSchema),
        400: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyAuthSessionRequest(ctx, reply, `${ctx.identityServiceBase}/internal/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post("/api/v1/auth/login", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Login user",
      body: toOpenApiSchema(AuthLoginRequestSchema),
      response: {
        200: toOpenApiSchema(AuthSessionResponseSchema),
        400: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyAuthSessionRequest(ctx, reply, `${ctx.identityServiceBase}/internal/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.get("/api/v1/auth/me", {
    config: { rateLimit: false },
    schema: {
      tags: ["auth"],
      summary: "Get current user session",
      security: [{ bearerAuth: [] }],
      response: {
        200: toOpenApiSchema(AuthMeResponseSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/me`, {
        method: "GET",
        headers: copyAuthHeader(req.headers.authorization)
      });
    }
  });

  server.post("/api/v1/auth/logout", {
    schema: {
      tags: ["auth"],
      summary: "Logout current user session",
      security: [{ bearerAuth: [] }],
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() }).passthrough()),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      clearAuthCookies(reply);
      const token = readBearerToken(req.headers.authorization);
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/logout`, {
        method: "POST",
        headers: copyAuthHeader(token ? `Bearer ${token}` : undefined)
      });
    }
  });

  server.post<{ Body: { refreshToken?: string } }>("/api/v1/auth/refresh", {
    config: { rateLimit: { max: REFRESH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Refresh auth session",
      body: toOpenApiSchema(z.object({ refreshToken: z.string().min(1).optional() }).passthrough()),
      response: {
        200: toOpenApiSchema(AuthSessionResponseSchema),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      const refreshToken = req.cookies[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;
      if (!refreshToken) {
        return reply.status(400).send({ error: "invalid_payload" });
      }

      return proxyAuthSessionRequest(ctx, reply, `${ctx.identityServiceBase}/internal/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
    }
  });

  server.delete("/api/v1/auth/account", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Delete user account (soft-delete with 30-day grace period)",
      security: [{ bearerAuth: [] }],
      body: toOpenApiSchema(DeleteAccountRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      clearAuthCookies(reply);
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/account`, {
        method: "DELETE",
        headers: { "content-type": "application/json", ...copyAuthHeader(req.headers.authorization) },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post("/api/v1/auth/verify-email", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Verify email with 6-digit code",
      security: [{ bearerAuth: [] }],
      body: toOpenApiSchema(EmailVerificationRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        400: toOpenApiSchema(ApiErrorSchema),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/verify-email`, {
        method: "POST",
        headers: { "content-type": "application/json", ...copyAuthHeader(req.headers.authorization) },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post("/api/v1/auth/resend-verification", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
    schema: {
      tags: ["auth"],
      summary: "Resend email verification code",
      security: [{ bearerAuth: [] }],
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        401: toOpenApiSchema(UnauthorizedErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/resend-verification`, {
        method: "POST",
        headers: copyAuthHeader(req.headers.authorization)
      });
    }
  });

  server.post("/api/v1/auth/forgot-password", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Request password reset email",
      body: toOpenApiSchema(ForgotPasswordRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        400: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/forgot-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post("/api/v1/auth/reset-password", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      summary: "Reset password with token",
      body: toOpenApiSchema(ResetPasswordRequestSchema),
      response: {
        200: toOpenApiSchema(z.object({ ok: z.boolean() })),
        400: toOpenApiSchema(ApiErrorSchema)
      }
    },
    handler: async (req, reply) => {
      return proxyJsonRequest(reply, ctx.requestFn, `${ctx.identityServiceBase}/internal/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {})
      });
    }
  });

  server.post<{ Params: { provider: string } }>("/api/v1/auth/oauth/:provider/start", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { provider } = req.params;
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/start`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.post<{ Params: { provider: string } }>("/api/v1/auth/oauth/:provider/complete", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { provider } = req.params;
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req.body ?? {})
        }
      );
    }
  });

  server.get<{ Params: { provider: string } }>("/api/v1/auth/oauth/:provider/callback", {
    config: { rateLimit: { max: AUTH_RATE_MAX, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const { provider } = req.params;
      const querySuffix = buildQuerySuffix(req.query);
      return proxyJsonRequest(
        reply,
        ctx.requestFn,
        `${ctx.identityServiceBase}/internal/auth/oauth/${encodeURIComponent(provider)}/callback${querySuffix}`,
        {
          method: "GET"
        }
      );
    }
  });
}
