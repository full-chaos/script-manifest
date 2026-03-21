import { z } from "zod";

export const OnboardingStatusSchema = z.object({
  emailVerified: z.boolean(),
  profileCompleted: z.boolean(),
  firstScriptUploaded: z.boolean(),
  competitionsVisited: z.boolean(),
  coverageVisited: z.boolean(),
});

export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

/** Partial update — steps are one-way: once `true` they stay `true`. */
export const OnboardingProgressUpdateSchema = z.object({
  profileCompleted: z.boolean().optional(),
  firstScriptUploaded: z.boolean().optional(),
  competitionsVisited: z.boolean().optional(),
  coverageVisited: z.boolean().optional(),
});

export type OnboardingProgressUpdate = z.infer<typeof OnboardingProgressUpdateSchema>;

export const OnboardingStatusResponseSchema = z.object({
  status: OnboardingStatusSchema,
});

export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusResponseSchema>;
