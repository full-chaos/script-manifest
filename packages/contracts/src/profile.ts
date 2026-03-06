import { z } from "zod";
import { OptionalUrlStringSchema } from "./common.js";

export const WriterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  genres: z.array(z.string()).default([]),
  demographics: z.array(z.string()).default([]),
  representationStatus: z.enum(["represented", "unrepresented", "seeking_rep"]),
  headshotUrl: OptionalUrlStringSchema.default(""),
  customProfileUrl: OptionalUrlStringSchema.default(""),
  isSearchable: z.boolean().default(true)
});

export type WriterProfile = z.infer<typeof WriterProfileSchema>;

export const WriterProfileUpdateRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  bio: z.string().max(5000).optional(),
  genres: z.array(z.string().min(1)).max(20).optional(),
  demographics: z.array(z.string().min(1)).max(20).optional(),
  representationStatus: z
    .enum(["represented", "unrepresented", "seeking_rep"])
    .optional(),
  headshotUrl: OptionalUrlStringSchema.optional(),
  customProfileUrl: OptionalUrlStringSchema.optional(),
  isSearchable: z.boolean().optional()
});

export type WriterProfileUpdateRequest = z.infer<typeof WriterProfileUpdateRequestSchema>;
