import { z } from "zod";

import { OptionalUrlStringSchema } from "./common.js";

export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120)
});

export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>;

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.string().default("writer").optional()
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSessionResponseSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.string().datetime({ offset: true }),
  user: AuthUserSchema
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const AuthMeResponseSchema = z.object({
  user: AuthUserSchema,
  expiresAt: z.string().datetime({ offset: true })
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

export const OAuthProviderSchema = z.enum(["google"]);

export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export const OAuthStartRequestSchema = z.object({
  redirectUri: OptionalUrlStringSchema.default(""),
  loginHint: z.string().trim().min(1).max(120).optional()
});

export type OAuthStartRequest = z.infer<typeof OAuthStartRequestSchema>;

export const OAuthStartResponseSchema = z.object({
  provider: OAuthProviderSchema,
  state: z.string().min(16),
  callbackUrl: z.string().url(),
  authorizationUrl: z.string().url(),
  mockCode: z.string().min(16).optional(),
  codeChallenge: z.string().min(1).optional(),
  expiresAt: z.string().datetime({ offset: true })
});

export type OAuthStartResponse = z.infer<typeof OAuthStartResponseSchema>;

export const OAuthCompleteRequestSchema = z.object({
  state: z.string().min(16),
  code: z.string().min(16)
});

export type OAuthCompleteRequest = z.infer<typeof OAuthCompleteRequestSchema>;
