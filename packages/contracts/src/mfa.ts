import { z } from "zod";

// ── MFA Setup ───────────────────────────────────────────────────────

export const MfaSetupResponseSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().min(1),
  qrCodeDataUrl: z.string().min(1)
});
export type MfaSetupResponse = z.infer<typeof MfaSetupResponseSchema>;

// ── MFA Verify Setup ────────────────────────────────────────────────

export const MfaVerifySetupRequestSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/)
});
export type MfaVerifySetupRequest = z.infer<typeof MfaVerifySetupRequestSchema>;

export const MfaVerifySetupResponseSchema = z.object({
  enabled: z.boolean(),
  backupCodes: z.array(z.string())
});
export type MfaVerifySetupResponse = z.infer<typeof MfaVerifySetupResponseSchema>;

// ── MFA Disable ─────────────────────────────────────────────────────

export const MfaDisableRequestSchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/)
});
export type MfaDisableRequest = z.infer<typeof MfaDisableRequestSchema>;

// ── MFA Verify (Login) ──────────────────────────────────────────────

export const MfaLoginVerifyRequestSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1).max(20) // TOTP or backup code
});
export type MfaLoginVerifyRequest = z.infer<typeof MfaLoginVerifyRequestSchema>;

// ── MFA Status ──────────────────────────────────────────────────────

export const MfaStatusResponseSchema = z.object({
  mfaEnabled: z.boolean(),
  enabledAt: z.string().datetime({ offset: true }).nullable()
});
export type MfaStatusResponse = z.infer<typeof MfaStatusResponseSchema>;

// ── Login Response Extension ────────────────────────────────────────
// When MFA is required, login returns this instead of a full session

export const MfaRequiredResponseSchema = z.object({
  requiresMfa: z.literal(true),
  mfaToken: z.string().min(1)
});
export type MfaRequiredResponse = z.infer<typeof MfaRequiredResponseSchema>;
