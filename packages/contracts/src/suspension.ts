import { z } from "zod";

// ── Suspension Reasons ──────────────────────────────────────────────

export const SuspensionReasonSchema = z.enum([
  "content_violation",
  "abuse",
  "fraud",
  "harassment",
  "spam",
  "manual_admin_action",
  "other"
]);
export type SuspensionReason = z.infer<typeof SuspensionReasonSchema>;

// ── Suspension Record ───────────────────────────────────────────────

export const UserSuspensionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  reason: z.string().min(1),
  suspendedBy: z.string().min(1),
  durationDays: z.number().int().positive().nullable(),
  startedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  liftedAt: z.string().datetime({ offset: true }).nullable(),
  liftedBy: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true })
});
export type UserSuspension = z.infer<typeof UserSuspensionSchema>;

// ── Admin Suspend Request ───────────────────────────────────────────

export const SuspendUserRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
  durationDays: z.number().int().positive().max(365).optional() // omit = permanent ban
});
export type SuspendUserRequest = z.infer<typeof SuspendUserRequestSchema>;

// ── Admin Lift Suspension Request ───────────────────────────────────

export const LiftSuspensionRequestSchema = z.object({
  suspensionId: z.string().min(1)
});
export type LiftSuspensionRequest = z.infer<typeof LiftSuspensionRequestSchema>;
