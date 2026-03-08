import { z } from "zod";

import { OptionalUrlStringSchema } from "./common.js";
import { COMMON_PASSWORDS } from "./common-passwords.js";

export const StrongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200)
  .superRefine((val, ctx) => {
    if (!/[A-Z]/.test(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password must contain at least one uppercase letter" });
    }
    if (!/[0-9]/.test(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password must contain at least one number" });
    }
    if (!/[^A-Za-z0-9]/.test(val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password must contain at least one special character" });
    }
    if (COMMON_PASSWORDS.has(val.toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This is a commonly used password. Please choose a different one." });
    }
  });

export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: StrongPasswordSchema,
  displayName: z.string().min(1).max(120),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms of service" })
  })
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

// Email verification
export const EmailVerificationRequestSchema = z.object({
  code: z.string().length(6)
});

export type EmailVerificationRequest = z.infer<typeof EmailVerificationRequestSchema>;

export const ResendVerificationRequestSchema = z.object({
  email: z.string().email()
});

export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;

// Password reset
export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email()
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: StrongPasswordSchema
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// Account deletion
export const DeleteAccountRequestSchema = z.object({
  password: z.string().min(1)
});

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
