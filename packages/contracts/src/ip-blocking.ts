import { z } from "zod";

// ── IP Block Entry ──────────────────────────────────────────────────

export const IpBlockEntrySchema = z.object({
  id: z.string().min(1),
  ipAddress: z.string().min(1),
  reason: z.string().min(1),
  blockedBy: z.string().min(1),
  autoBlocked: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true })
});
export type IpBlockEntry = z.infer<typeof IpBlockEntrySchema>;

// ── Add IP Block ────────────────────────────────────────────────────

export const AddIpBlockRequestSchema = z.object({
  ipAddress: z.string().min(1).max(45), // supports IPv4 and IPv6
  reason: z.string().min(1).max(1000),
  expiresInHours: z.number().int().positive().max(8760).optional() // up to 1 year
});
export type AddIpBlockRequest = z.infer<typeof AddIpBlockRequestSchema>;

// ── IP Block List Request ───────────────────────────────────────────

export const IpBlockListRequestSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  includeExpired: z.coerce.boolean().default(false)
});
export type IpBlockListRequest = z.infer<typeof IpBlockListRequestSchema>;
